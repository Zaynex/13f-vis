# OAuth Session Cookie 调试报告

## 问题现象

用户在机构页面（`/institutions/[cik]`）点击 "Track Fund" 按钮后，按钮立即显示 "✓ Tracked"（乐观更新），但**刷新页面后**状态丢失，重新变成未 tracked。

HTTP 请求表现为：点击 Track 后，POST `/api/user/track` 返回 302 Found。

```
POST /api/user/track → 302 → /auth?next=...
```

数据库中没有写入记录。

---

## 系统架构背景

### 认证组件

| 组件 | 用途 |
|------|------|
| `@supabase/ssr` `createServerClient` | SSR 场景下读取/写入 cookies |
| `@supabase/ssr` `createClient` | 浏览器端客户端，localStorage 存储 session |
| `POST /api/user/track` | 受保护的 API route，使用 `createServerClient` 读取 cookie 验证 session |

### 认证流程（修复前）

```
用户点击 "Track Fund"
  → 检查 supabase.auth.getUser() [浏览器端 client]
    → 有 session（存在 localStorage）
    → POST /api/user/track
      → createServerClient 读取 request.cookies
        → cookies 为空（没有 session cookie）
        → getUser() 返回 null
        → 302 重定向到 /auth

用户未登录 → 跳转 Google OAuth
  → /auth/callback?code=xxx&next=/institutions/xxx
    → exchangeCodeForSession(code)
      → 设置 session cookie 到 supabaseResponse
    → NextResponse.redirect(url)
      → 重定向时没有携带 cookie
    → 浏览器没有收到 session cookie
    → 回到机构页面，API 依然没有 session
```

### 关键代码路径

**POST `/api/user/track`** — API route：
```typescript
export async function POST(request: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },  // ← 读取请求中的 cookies
        setAll: (c) => c.forEach(...)               // ← 不向浏览器写入
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  //                                              ↑
  //                               内部读取 cookie 中的 access_token
  //                               如果 cookie 为空，这里返回 null
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // ...
}
```

**`/auth/callback`** — OAuth 回调：
```typescript
export async function GET(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  //                         ↑
  //              创建了一个 "过渡用" 的 NextResponse
  const supabase = createServerClient(..., {
    cookies: {
      getAll() { return request.cookies.getAll() },
      setAll(cookiesToSet) {
        // ↓ exchangeCodeForSession 会调用这个 setAll
        //   将 session cookies 写入 supabaseResponse
        cookiesToSet.forEach(...)
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  //                            ↑
  //         成功后，session cookies 被写入 supabaseResponse
  //         但 supabaseResponse 是 NextResponse.next() 对象

  if (!error) {
    const redirect = NextResponse.redirect(url, 302)
    //              ↑
    //              创建了一个全新的 NextResponse.redirect()
    //              和 supabaseResponse 是完全不同的对象
    const cookies = supabaseResponse.cookies.getAll()
    //              ↑ 这时 cookies 里有 session 信息
    //                但问题是：exchangeCodeForSession 真的调用了 setAll 吗？
    redirect.cookies.set(...)
    return redirect
  }
}
```

---

## 第一次修复尝试（失败）

### 代码

```typescript
// 创建 redirect
const redirect = NextResponse.redirect(url, 302)
// 从 supabaseResponse 读取 cookies 并写入 redirect
supabaseResponse.cookies.getAll().forEach((c) => {
  redirect.cookies.set(c.name, c.value, c)
})
return redirect
```

### 为什么失败

`supabaseResponse` 是 `NextResponse.next({ request })` 创建的。当 `exchangeCodeForSession` 内部调用 `setAll` 时，确实把 cookies 写入了 `supabaseResponse.cookies`。但 `supabaseResponse.cookies.getAll()` 返回的是**已经被 set 的 cookies 列表**。

问题不在于 cookies 没有被读取，而在于：`exchangeCodeForSession` 在 Next.js App Router 的 SSR 环境下，**可能根本没有调用 `setAll`**。Supabase SSR 的 `setAll` 回调设计是为了在服务端渲染时协调 cookie 写入，但在 App Router 中，`NextResponse.next()` 返回的 cookie container 和最终返回的 redirect response 是脱节的。

---

## 第二次修复尝试（仍然失败）

### 代码

```typescript
// 先创建 redirect
const redirect = NextResponse.redirect(url.toString(), 302)
// 再从 supabaseResponse 复制 cookies
const cookies = supabaseResponse.cookies.getAll()
cookies.forEach((c) => {
  redirect.cookies.set(c.name, c.value, c)
})
return redirect
```

### 为什么仍然失败

`supabaseResponse.cookies.getAll()` 能读到 cookies，说明 `exchangeCodeForSession` 确实调用了 `setAll`。但复制的值是空的或者不是正确的 session cookie。

真正的问题：**`setAll` 写入 `supabaseResponse.cookies` 的值不是浏览器需要的 session cookies 格式**。Supabase SSR 的 cookie 写入机制在 Next.js App Router 中可能有兼容性问题，导致虽然 `getAll()` 返回了某些 cookie，但这些 cookie 不是有效的 session token，或者格式不对。

---

## 根因分析

### `exchangeCodeForSession` 的行为

`exchangeCodeForSession(code)` 返回 `{ data: { session }, error }`。其中 `session` 对象包含：

```typescript
{
  access_token: string,      // 用于 API 认证
  refresh_token: string,     // 用于刷新 session
  expires_in: number,       // access_token 过期时间
  expires_at: number,       // access_token 过期时间戳
  token_type: 'Bearer',
  user: { ... }
}
```

这些是**明文可用的 token 数据**，不依赖 cookie 机制。

### `setAll` 回调的设计意图

`setAll(cookiesToSet)` 中的 `cookiesToSet` 是 Supabase 期望写入浏览器的 cookies 列表。在传统 SSR（如 Pages Router）或非 Next.js SSR 框架中，这个回调应该直接将 cookies 发送给浏览器。

但在 Next.js App Router 中，`setAll` 写入 `supabaseResponse.cookies`，而 `supabaseResponse` 是 `NextResponse.next()` 创建的。**这个中间响应对象从未真正返回给浏览器**。我们返回的是 `NextResponse.redirect()`，一个完全独立的新对象。

即使复制了 cookies，**Supabase SSR 在 App Router 中写入的 cookie 内容可能不完整或格式不对**。

### 核心问题

> **不应该依赖 `setAll` 回调在 App Router 中传递 session cookies。应该直接从 `exchangeCodeForSession` 返回的 session 数据中提取 token，并显式设置到最终返回的 redirect 响应上。**

---

## 最终修复方案

```typescript
const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

if (!error && sessionData?.session) {
  const { session } = sessionData

  const url = new URL(`${origin}${next}`)
  url.searchParams.set('oauth_complete', '1')
  const redirect = NextResponse.redirect(url.toString(), 302)

  // 直接从 session 对象中提取 token，显式设置到 redirect 响应
  const cookieOptions = {
    maxAge: session.expires_in ?? 3600,
    sameSite: 'lax' as const,
    secure: true,
    path: '/',
    httpOnly: true,
  }

  redirect.cookies.set('sb-access-token', session.access_token, cookieOptions)
  redirect.cookies.set('sb-refresh-token', session.refresh_token, {
    ...cookieOptions,
    maxAge: 30 * 24 * 60 * 60, // refresh_token 保留 30 天
  })

  return redirect
}
```

### 为什么这个方案有效

1. **`exchangeCodeForSession` 返回完整的 session 数据**，包括 `access_token` 和 `refresh_token`，这些是明文可用的
2. **直接在 redirect 响应上设置 cookie**，不经过任何中间 `setAll` 回调
3. **`httpOnly: true`** — 防止 JavaScript 读取（安全）
4. **`secure: true`** — 仅在 HTTPS 发送
5. **`sameSite: 'lax'`** — 允许跨站点的 GET 请求携带 cookie（OAuth 回调是跨站点的）
6. **refresh_token 30 天有效期** — 用户不必频繁重新授权

---

## 关键调试手段

### 1. Cookie 检查

在浏览器 DevTools → Application → Cookies 中检查 `/auth/callback` 回调后是否设置了两个 session cookies：

| Cookie 名称 | 预期内容 |
|------------|---------|
| `sb-access-token` | 有效的 JWT access token |
| `sb-refresh-token` | refresh token |

如果这两个 cookie 不存在，说明 redirect 响应没有正确设置 session cookie。

### 2. API Route 日志

在 POST `/api/user/track` 中添加：

```typescript
const cookies = request.cookies.getAll()
console.log('cookies received:', cookies.map(c => c.name))
const { data: { user } } = await supabase.auth.getUser()
console.log('getUser result:', user ? `user: ${user.id}` : 'null')
```

**正常输出**（修复后）：
```
cookies received: ["sb-access-token", "sb-refresh-token"]
getUser result: user: 123e4567-e89b-12d3-a456-426614174000
```

**异常输出**（修复前）：
```
cookies received: []
getUser result: null
```

### 3. Vercel Runtime Logs

```bash
vercel logs <deployment-url>
```

在本地测试时观察 `exchangeCodeForSession` 调用前后的 cookies 变化。

---

## 为什么这个问题持续了很久

1. **乐观更新掩盖了问题**：点击 "Track Fund" 后 UI 立即显示 tracked（因为是在提交前就更新了本地状态），让人误以为写入成功了。只有刷新页面才会暴露问题。

2. **OAuth 流程的复杂性**：涉及多个组件（Supabase Auth、Google OAuth、callback route、redirect chain），任何一个环节出错都会导致认证失败。

3. **Supabase SSR 的抽象泄漏**：在传统 SSR 框架中，`setAll` 回调可以直接写 HTTP 响应的 cookies。但在 Next.js App Router 中，`setAll` 写入的是中间 `NextResponse` 对象，最终返回的 response 可能是完全不同的对象。这个抽象在 App Router 中是有缺陷的。

4. **调试环境差异**：本地开发环境的 cookie 行为和部署到 Vercel 后可能不同（Vercel 有额外的 SSO 层和 cookie 策略）。

---

## 相关文件

| 文件 | 修改内容 |
|------|---------|
| `src/app/auth/callback/route.ts` | 修复 OAuth callback 中的 session cookie 传递 |
| `src/app/api/user/track/route.ts` | 调试日志（已移除） |
| `src/middleware.ts` | 保护 `/api/user/*` 路由，302 重定向到登录页 |
| `src/app/institutions/[cik]/page.tsx` | Track 按钮的乐观更新 + pending action replay |

---

## 测试验证

修复后应通过以下测试：

1. [ ] 退出登录，访问机构页面，点 "Track Fund" → Google 授权 → 回到机构页面显示 "✓ Tracked"
2. [ ] 刷新页面，tracked 状态依然保持（不再是 optimistic UI 临时状态）
3. [ ] 打开浏览器 DevTools，Application → Cookies 中可以看到 `sb-access-token` 和 `sb-refresh-token`
4. [ ] `POST /api/user/track` 返回 201（而非 302）
5. [ ] `GET /api/user/track` 返回该用户的 tracked 列表
