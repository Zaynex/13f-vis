# OAuth Session Cookie 调试报告

## 问题现象

用户在机构页面点击 `Track Fund`，或进入 `Track Changes` 时，右上角已经能显示 Google 账号，但受保护接口仍然返回未登录。

这说明浏览器端 Supabase session 已存在，但服务端 `/api/user/*` 和 middleware 读不到可验证的 Supabase SSR cookie。

---

## 当前认证架构

| 组件 | 用途 |
|------|------|
| `@supabase/ssr` `createBrowserClient` | 浏览器端 Supabase client，负责 PKCE OAuth、浏览器 session 和 code verifier cookie |
| `@supabase/ssr` `createServerClient` | 服务端 route / middleware 读取并写入 Supabase SSR cookies |
| `/auth/callback` | 使用 `exchangeCodeForSession(code)` 完成 OAuth code exchange |
| `/api/user/*` | 受保护 API，通过 server client 的 `auth.getUser()` 验证 request cookies |

---

## 根因

之前浏览器端 client 使用的是 `@supabase/supabase-js` 的默认 `createClient`。该默认 OAuth flow 不会生成服务端 callback 所需的 PKCE `code_challenge` / code verifier cookie。

结果是：

```text
Google OAuth 登录成功
  -> 浏览器端可以恢复 session，右上角能显示用户
  -> 服务端 callback 无法可靠完成 PKCE code exchange / cookie 同步
  -> /api/user/track 读取 request.cookies 时没有有效 session
  -> 用户点击 Track 时仍被当作未登录
```

服务端 `/auth/callback` 的正确方向仍然是保留 `exchangeCodeForSession(code)`，问题在于浏览器端必须用 `createBrowserClient` 发起 PKCE OAuth，让 Supabase SSR 能把 code verifier 写入 cookie。

---

## 正确修复方案

### 1. 浏览器端 client 使用 Supabase SSR

`src/lib/supabase.ts`：

```typescript
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
```

这样 `signInWithOAuth({ provider: 'google' })` 会生成 PKCE OAuth URL，并把 code verifier 存入 Supabase SSR cookie。

### 2. Callback 保留 code exchange

`/auth/callback` 继续使用：

```typescript
const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
```

`createServerClient` 的 `setAll` 会得到 Supabase SSR 需要设置的 cookie。应将这些 cookie 原样写入最终返回给浏览器的 redirect response。

不要手动构造 `sb-access-token` / `sb-refresh-token` cookie。当前 `@supabase/ssr` 使用自己的 storage key、base64/chunk cookie 格式，手动写 token-only cookie 会和服务端 `createServerClient` 的读取格式不匹配。

### 3. `next` 必须默认并校验

OAuth callback 只允许站内相对路径作为 `next`。缺失、空字符串、绝对 URL、协议相对 URL 或反斜杠路径都回退到 `/watchlist`，避免拼出 `/null` 或引入 open redirect 风险。

---

## 调试检查点

### OAuth URL

点击 `Continue with Google` 后，Supabase/Google OAuth 链路应是 code flow：

```text
response_type=code
redirect_to=http://localhost:3000/auth/callback?next=/watchlist
```

单元测试还会检查 Supabase authorize URL 包含：

```text
code_challenge=...
code_challenge_method=s256
```

### Server cookie

Google 授权回到 `/auth/callback?code=...` 后，最终 redirect response 应携带 Supabase SSR 设置的 auth cookies。cookie 名称可能是 project-ref scoped storage key 或 chunked cookie，不应按 `sb-access-token` / `sb-refresh-token` 这类手写名称判断。

### 受保护 API

登录后请求：

```text
GET /api/user/track
POST /api/user/track
```

应能通过 `createServerClient(...).auth.getUser()` 获得用户，而不是返回 `401 Unauthorized` 或跳回 `/auth`。

---

## 验收清单

1. 退出登录，访问机构页面，点击 `Track Fund`。
2. 选择 Google 账号并完成授权。
3. 回到页面后，点击 `Track Fund` 不再跳登录。
4. 刷新页面后 tracked 状态仍然保持。
5. `GET /api/user/track` 返回当前用户 tracked 列表。
6. `POST /api/user/track` 返回成功状态，而不是未登录。
