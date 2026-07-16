# 海外商城 MVP 完整实施方案

> 版本：1.0  
> 日期：2026-07-16  
> 适用项目：`dqxd-mall-en`、`ruoyi-vue-pro`  
> 当前范围：英文商品发布、静态商城构建、免费部署、自有域名  
> 暂不包含：R2、D1、在线询盘、会员、购物车、支付、订单

---

## 1. 最终结论

本期采用下面的方案：

```text
若依多租户运营后台
        ↓
运营在指定租户中维护英文商品并上架
        ↓
运营点击“发布外网商城”
        ↓
若依后端调用 Cloudflare Deploy Hook
        ↓
Cloudflare Workers Builds 拉取商城代码
        ↓
Astro 构建时携带 tenant-id 调用现有 App 商品接口
        ↓
生成商品列表、分类页、商品详情等纯静态文件
        ↓
部署到 Cloudflare Workers Static Assets
        ↓
通过自有域名和 HTTPS 对外访问
```

本期不建设第二套商品数据库，不增加商品快照表，不使用 R2、D1，也不让海外访客在打开页面时实时查询若依后端。

现有若依商品系统继续作为唯一数据源，一个租户对应一个商城。

---

## 2. 建设目标

### 2.1 业务目标

- 运营继续登录现有若依后台维护商品。
- 每个商城使用一个独立租户，商品和分类按租户隔离。
- 商品内容直接维护为英文。
- 运营无需登录 Cloudflare、GitHub 或接触代码。
- 商品编辑完成并上架后，由运营主动点击发布。
- 发布完成后，海外访客通过自有域名访问。
- 首期使用静态电话、邮箱、WhatsApp 等联系方式。
- 除域名外，不增加新的固定服务器或数据库费用。

### 2.2 技术目标

- 商品页面在构建时生成，不在访客请求时调用国内 API。
- 国内若依系统短暂故障时，已发布商城继续正常访问。
- 新版本构建失败时，线上继续保留上一成功版本。
- 商品下架并重新发布后，不再生成该商品详情页。
- 支持后续按相同方式增加更多租户和商城。

### 2.3 本期不做

- 在线提交询盘表单。
- R2 图片或商品快照存储。
- D1 数据库。
- Worker 动态业务接口。
- 在线价格计算、实时库存、购物车、支付和订单。
- 会员注册和登录。
- 多语言内容管理。
- 自动审核、定时发布和复杂发布版本中心。

---

## 3. 当前系统现状

### 3.1 运营后台

当前使用：

```text
D:\code\dqxd-admin-sys\ruoyi-vue-pro
```

已经具备：

- 多租户。
- 商品分类。
- SPU、SKU、商品属性。
- 商品新增、编辑、导入、上下架。
- 英文商品名称、简介和详情录入。
- 商品图片和轮播图。
- 一个租户对应一个商城的业务规则。

因此，本期不再建设新的 CMS 或商品运营系统。

### 3.2 商城前端

当前使用：

```text
D:\code\dqxd-mall-en
```

技术栈：

- Astro 5。
- TypeScript。
- 静态输出 `output: "static"`。
- 已有首页、商品列表、分类页、商品详情、关于我们、联系页面。
- 已有 sitemap 和基础 SEO 结构。

当前代码仍按照“发布快照接口”设计，并包含 Worker、D1 询盘相关代码。本期需要改成直接复用现有商品 App 接口，并移除对动态询盘的依赖。

---

## 4. 总体架构

```text
┌──────────────────────────────────────────────────────┐
│                  国内若依运营系统                      │
│                                                      │
│  租户 A：英文商城商品、分类、SKU、图片                 │
│                                                      │
│  运营编辑/导入商品 → 上架 → 点击“发布外网商城”         │
│                                  │                   │
│                                  │ HTTP POST         │
│                                  ▼                   │
│                        Cloudflare Deploy Hook         │
└──────────────────────────────────┬───────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────┐
│               Cloudflare Workers Builds              │
│                                                      │
│  1. 拉取 GitHub/GitLab 中的 Astro 代码                │
│  2. 注入 API 地址、tenant-id、域名、联系方式           │
│  3. Astro 构建时请求若依 App API                      │
│  4. 生成 dist 静态文件                                │
│  5. Wrangler 部署静态资源                             │
└──────────────────────────────────┬───────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────┐
│            Cloudflare Workers Static Assets          │
│                                                      │
│  HTML / CSS / JS / sitemap / robots / 搜索索引        │
│  自有域名 + HTTPS + Cloudflare 全球网络                │
└──────────────────────────────────┬───────────────────┘
                                   │
                                   ▼
                         海外访客访问静态商城
```

关键边界：

- 若依负责编辑和提供构建数据。
- Cloudflare 负责构建、静态托管、域名、HTTPS 和版本回滚。
- Astro 负责把商品数据转换成静态页面。
- 访客不会直接请求商品 App API。
- 图片第一阶段继续使用现有图片 URL，因此图片服务仍是运行期外部依赖。

---

## 5. 多租户与多商城模型

### 5.1 对应关系

```text
一个若依租户 = 一个商城 = 一个 Cloudflare Worker 项目 = 一个主域名
```

示例：

| tenant-id | 商城 | Worker 项目 | 域名 |
|---:|---|---|---|
| 1001 | 英文商城 | `dqxd-mall-en` | `en.example.com` |
| 1002 | 其他品牌商城 | `brand-b-mall` | `www.brand-b.com` |

本期只有一个英文商城时，先使用环境变量配置，不新建商城配置表。

### 5.2 构建隔离

每个商城项目配置自己的：

- `MALL_TENANT_ID`
- `MALL_API_BASE_URL`
- `PUBLIC_SITE_URL`
- `PUBLIC_CONTACT_EMAIL`
- `PUBLIC_CONTACT_PHONE`
- `PUBLIC_WHATSAPP_URL`
- Cloudflare Deploy Hook

Astro 构建请求统一携带：

```http
tenant-id: 1001
```

商品、分类和 SKU 查询由现有租户机制隔离。

### 5.3 后续扩展

当商城数量增加后，再增加商城配置表：

```text
mall_site_config
├── id
├── tenant_id
├── site_name
├── domain
├── deploy_hook_url
├── enabled
├── last_publish_user_id
├── last_publish_time
└── last_build_uuid
```

首期不需要创建该表。

---

## 6. 现有商品接口复用方案

### 6.1 接口清单

本期复用：

```http
GET /app-api/product/category/list
GET /app-api/product/spu/page
GET /app-api/product/spu/get-detail
```

保留但不作为主流程使用：

```http
GET /app-api/product/spu/list-by-ids
```

### 6.2 商品分页接口

请求：

```http
GET /app-api/product/spu/page?pageNo=1&pageSize=200
tenant-id: 1001
```

用途：

- 获取当前租户全部上架商品。
- 获取商品列表展示字段。
- 获取本次构建需要生成详情页的商品 ID。
- 保留后台配置的商品排序。

现有 Mapper 已强制限制：

```java
status = ProductSpuStatusEnum.ENABLE
```

因此它适合作为商城发布的商品入口。

每页最大 200 条，构建程序需要根据 `total` 自动循环翻页，不能假设商品永远少于 200 条。

### 6.3 商品详情接口

请求：

```http
GET /app-api/product/spu/get-detail?id=698
tenant-id: 1001
```

用途：

- 商品详情 HTML。
- 商品主图和轮播图。
- 商品价格和库存。
- SKU。
- SKU 属性名称和值。
- SKU 图片、重量和体积。

接口会再次校验商品是否上架，适合生成公开详情页。

### 6.4 `list-by-ids` 接口

该接口不作为构建主流程使用，原因：

- 它按照 ID 直接查询。
- 没有明确过滤商品上架状态。
- 不包含商品详情 HTML。
- 不包含 SKU 和 SKU 属性。

允许使用的场景：

- ID 已经来自 `/spu/page` 的上架商品结果。
- 相关推荐或其他批量基础信息查询。

首期直接通过分页结果生成列表，再通过详情接口补齐详情，不需要调用 `list-by-ids`。

### 6.5 分类接口

请求：

```http
GET /app-api/product/category/list
tenant-id: 1001
```

返回：

- 分类 ID。
- 父分类 ID。
- 分类名称。
- 分类图片。

接口只返回启用分类，并已经按照后台分类排序处理。

### 6.6 接口副作用

`get-detail` 当前会执行：

```java
productSpuService.updateBrowseCount(id, 1);
```

匿名构建不会创建用户浏览历史，但每次发布会让每件商品的浏览次数增加 1。

首期有两个选择：

#### 选择 A：完全不修改商品接口

- 直接调用当前 `get-detail`。
- 接受每次发布每件商品增加一次浏览量。
- 开发量最小。

#### 选择 B：推荐的小优化

给现有接口增加兼容参数：

```http
GET /app-api/product/spu/get-detail?id=698&recordBrowse=false
```

规则：

- `recordBrowse` 默认值为 `true`，不影响现有 App。
- Cloudflare 构建时传 `false`。
- 不新增接口。

该优化不影响首期上线，可在浏览统计正式使用前完成。

---

## 7. 接口字段与商城字段映射

### 7.1 分类映射

| 商城字段 | App 接口字段 | 处理规则 |
|---|---|---|
| `id` | `id` | 转为字符串 |
| `parentId` | `parentId` | `0` 可转为 `null` |
| `name` | `name` | 直接使用英文分类名 |
| `imageUrl` | `picUrl` | 允许为空时使用占位图 |
| `description` | 无 | 首期为空字符串 |
| `sort` | 无 | 使用接口数组顺序 |

### 7.2 商品列表映射

| 商城字段 | App 接口字段 | 处理规则 |
|---|---|---|
| `id` | `id` | 转为字符串 |
| `name` | `name` | 直接使用 |
| `introduction` | `introduction` | 直接使用 |
| `categoryId` | `categoryId` | 转为字符串 |
| `coverImageUrl` | `picUrl` | 必填校验 |
| `imageUrls` | `sliderPicUrls` | 去空、去重 |
| `price` | `price` | 单位为分，展示时除以 100 |
| `marketPrice` | `marketPrice` | 单位为分 |
| `stock` | `stock` | 可不在海外商城展示 |
| `salesCount` | `salesCount` | 可不展示 |
| `sortIndex` | 分页返回顺序 | 保持后台排序 |

### 7.3 商品详情映射

| 商城字段 | App 接口字段 | 处理规则 |
|---|---|---|
| `descriptionHtml` | `description` | 构建时清洗 HTML 后输出 |
| `topCategoryId` | `topCategoryId` | 转为字符串 |
| `skus` | `skus` | 逐项转换 |
| `specifications` | `skus[].properties` | 映射属性名和值 |
| `skuImageUrl` | `skus[].picUrl` | 无图时回退商品主图 |
| `weight` | `skus[].weight` | 按业务需要展示 |
| `volume` | `skus[].volume` | 按业务需要展示 |

### 7.4 当前接口没有返回的字段

数据库中存在，但 App VO 当前没有返回：

- `spuCode`
- `keyword`
- `sort`
- `updateTime`
- `skuCode`

首期处理：

| 缺失字段 | 首期方案 |
|---|---|
| `spuCode` | 商品 URL 使用 `id`，不依赖 `spuCode` |
| `keyword` | 本地搜索使用名称、简介和分类名称 |
| `sort` | 使用 `/page` 返回顺序 |
| `updateTime` | 不显示商品更新时间 |
| `skuCode` | 不显示，必要时使用 SKU ID |

因此，商品 App VO 不需要为了首期上线而增加字段。

如果后续需要稳定的产品编码 URL、SEO slug 或对外显示 SKU 编码，再给现有 VO 增加这些字段。

---

## 8. 静态构建数据流程

### 8.1 构建步骤

```text
1. 读取构建环境变量
2. 请求分类列表
3. 请求商品第 1 页
4. 根据 total 继续请求后续页
5. 固定本次构建的上架商品 ID 列表
6. 以最大 5 个并发请求商品详情
7. 校验和规范化数据
8. 生成分类页、列表页和商品详情页
9. 生成搜索索引、sitemap 和 robots
10. Astro 输出 dist
11. Wrangler 部署 dist
```

### 8.2 请求规则

- 每个请求携带 `tenant-id`。
- 单次请求超时建议为 30 秒。
- 网络错误和 5xx 最多重试 2 次。
- 4xx 和业务错误不自动重试。
- 校验 `CommonResult.code` 是否为成功值。
- 详情请求最大并发建议为 5。
- 任何必需商品详情获取失败时，整个构建失败，不发布半套数据。

### 8.3 数据校验

阻止发布的错误：

- 商品 ID 缺失。
- 商品名称为空。
- 分类 ID 缺失。
- 主图 URL 缺失或不是合法 URL。
- 商品详情接口返回不存在或已下架。
- 分类 ID 在分类列表中找不到。
- 重复商品 ID。
- API 返回业务错误。

只警告、不阻止发布：

- 商品简介为空。
- 商品详情为空。
- 轮播图为空。
- SKU 为空。
- 分类图片为空。
- 市场价为空。

### 8.4 HTML 安全

当前 Astro 商品详情使用 `set:html` 输出富文本，因此构建前必须清洗 `description`：

- 删除 `script`、`iframe`、`object`、`embed`。
- 删除 `onerror`、`onclick` 等事件属性。
- 禁止 `javascript:` URL。
- 只保留需要的排版标签。
- 外链增加 `rel="noopener noreferrer"`。

不能因为内容来自内部运营后台就跳过该处理。

### 8.5 构建一致性

首期不使用发布快照，构建期间如果运营继续修改商品，可能出现列表和详情读取时间不同的问题。

首期控制方式：

- 运营完成全部编辑后再点击发布。
- 点击发布后等待构建完成，再继续修改。
- 构建程序先固定商品 ID 列表，再读取详情。

对于当前少量商品，该方式足够。

当商品规模增大、多人同时编辑或要求严格审计时，再升级为不可变发布快照，不在首期提前建设。

---

## 9. 商城 URL 与页面方案

### 9.1 页面结构

```text
/                           首页
/products/                  商品列表
/products/{id}/             商品详情
/categories/{id}/           分类页
/about/                     关于我们
/contact/                   联系方式
/privacy/                   隐私政策
/404.html                   404 页面
/sitemap-index.xml          sitemap
/robots.txt                 搜索引擎规则
/search-index.json          静态搜索索引
```

### 9.2 商品 URL

首期使用：

```text
/products/698/
```

原因：

- 当前 App VO 已经返回 ID。
- 无需改后端。
- ID 在当前系统中唯一且稳定。

后续如果增加英文 slug：

```text
/products/chongqing-spicy-sour-vermicelli/
```

必须同时处理：

- slug 唯一性。
- slug 修改后的 301 重定向。
- 历史 URL 保存。
- 多租户下 slug 唯一范围。

这些不在首期范围内。

### 9.3 商品上下架

- 商品上架并发布：生成详情页。
- 商品下架但未发布：线上旧页面仍存在。
- 商品下架并重新发布：新版本不再包含详情页，旧 URL 返回 404。
- 如果需要保留 SEO 权重，后续增加重定向管理。

---

## 10. 商品搜索与分类筛选

首期采用纯前端静态搜索，不使用 D1 或搜索服务。

搜索索引只包含：

```json
{
  "id": "698",
  "name": "Chongqing Spicy Sour Vermicelli",
  "introduction": "Product introduction",
  "categoryId": "100",
  "categoryName": "Noodles"
}
```

搜索字段：

- 商品名称。
- 商品简介。
- 分类名称。

筛选：

- 全部分类。
- 单个分类。

商品量在几百到一两千以内时，静态搜索足够。商品量显著增长后再评估拆分索引或动态搜索。

---

## 11. 价格与库存展示

当前若依商品价格单位为“分”，必须统一转换：

```ts
displayPrice = price / 100
```

通过配置决定是否显示：

```env
PUBLIC_SHOW_PRICE=false
PUBLIC_CURRENCY=CNY
```

推荐首期：

- B2B 展示商城默认隐藏价格。
- 页面显示 “Contact us for pricing”。
- 如果需要显示，使用 `Intl.NumberFormat` 格式化。

示例：

```ts
new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'CNY'
}).format(price / 100)
```

禁止直接拼接整数，否则会再次出现 `10 15`、`8 8` 一类错误显示。

库存首期不建议对海外访客展示，因为静态页面上的库存只代表发布时数据，不是实时库存。

---

## 12. 联系方式方案

首期不使用 Worker、D1 或在线表单。

网站提供：

- 电话链接：`tel:`
- 邮箱链接：`mailto:`
- WhatsApp 链接。
- 固定联系地址。

商品详情页自动把商品名称和 ID 放入邮件主题：

```text
mailto:sales@example.com
  ?subject=Inquiry about Chongqing Spicy Sour Vermicelli (Product 698)
```

这样访客仍可以带着商品上下文发起联系，但网站不需要动态后端。

---

## 13. Astro 商城改造

### 13.1 数据层

修改：

```text
src/lib/catalog.ts
src/lib/schema.ts
src/env.d.ts
```

主要工作：

- 移除 `SITE_EXPORT_URL` 发布快照读取。
- 增加若依 `CommonResult`、分页、分类、列表和详情 Schema。
- 增加分页拉取逻辑。
- 增加详情并发拉取逻辑。
- 增加 API 数据到商城模型的规范化转换。
- 增加超时、重试和错误提示。
- 在同一次 Astro 构建中缓存商品数据，避免每个页面重复调用 API。

### 13.2 路由

当前：

```text
src/pages/products/[spuCode].astro
```

调整为：

```text
src/pages/products/[id].astro
```

同时调整：

- `ProductCard.astro`
- 商品列表页。
- 分类页。
- 搜索索引。
- JSON-LD 中的 `sku`，首期使用商品 ID 或不输出。
- 联系方式中携带的产品编码。

### 13.3 联系页面

调整：

```text
src/components/InquiryForm.astro
src/pages/contact.astro
```

移除动态提交，替换成静态联系方式和链接。

### 13.4 Worker 和 D1

当前项目中的下列内容本期不参与部署：

```text
worker/
worker/migrations/
PUBLIC_INQUIRY_API_URL
PUBLIC_TURNSTILE_SITE_KEY
worker:deploy
worker:db:local
worker:db:remote
```

建议在静态 MVP 完成后删除或移入后续分支，避免构建脚本误执行。

### 13.5 Astro 输出

继续保持：

```js
output: 'static'
```

不安装 Astro Cloudflare SSR Adapter，不引入运行时 Worker 脚本。

---

## 14. 若依后台发布改造

### 14.1 发布按钮

在英文商城租户的商品列表页增加：

```text
发布外网商城
```

建议放置在：

- 商品列表工具栏。
- 导入、导出按钮附近。

不建议在每次保存或上下架时自动发布，避免运营连续编辑导致频繁构建。

### 14.2 后台发布接口

建议增加：

```http
POST /admin-api/product/site/publish
```

接口职责：

1. 获取当前登录用户。
2. 获取当前 `tenant-id`。
3. 校验当前租户是否配置商城。
4. 校验用户是否有发布权限。
5. 对当前租户加短时间发布锁。
6. 从服务端配置读取 Deploy Hook。
7. 向 Deploy Hook 发送 HTTP POST。
8. 保存发布操作日志。
9. 返回 Cloudflare `build_uuid`。

返回示例：

```json
{
  "code": 0,
  "data": {
    "buildUuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "queued",
    "message": "商城发布任务已提交"
  },
  "msg": ""
}
```

### 14.3 权限

增加权限标识：

```text
product:site:publish
```

只有指定运营或管理员可以发布。

商品编辑权限不自动等于商城发布权限。

### 14.4 Deploy Hook 保存

Deploy Hook URL 相当于发布密钥：

- 不能写在管理端前端代码里。
- 不能返回给浏览器。
- 不能提交到 Git。
- 必须保存在后端环境变量或受控配置中。

单商城首期建议：

```env
MALL_EN_TENANT_ID=1001
MALL_EN_DEPLOY_HOOK=https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/...
MALL_EN_DOMAIN=https://en.example.com
```

### 14.5 重复发布控制

后端建议增加 60 秒 Redis 锁：

```text
mall:publish:{tenantId}
```

如果正在提交发布：

```text
商城发布任务已提交，请稍后再试
```

Cloudflare Deploy Hook 自身会对尚未真正开始的重复触发做一定去重，但后台仍应限制连续点击。

### 14.6 发布状态

首期只显示：

- 已提交。
- 提交失败。
- 构建任务 ID。
- 预计 1～3 分钟后完成。
- “打开商城”按钮。

不在首期接入 Cloudflare Builds API 做实时状态查询，因为这需要额外 API Token 和状态轮询。

后续可增加：

- 构建中。
- 构建成功。
- 构建失败。
- 构建日志链接。
- 上次发布时间和发布人。

---

## 15. Cloudflare 部署方案

### 15.1 产品选择

采用：

```text
Cloudflare Workers Static Assets
```

不采用新的 Pages 项目作为首选。Cloudflare 当前官方建议新静态站优先使用 Workers Static Assets；纯静态 Astro 站点只需要配置静态目录，不需要 Worker 脚本。

官方资料：

- [Workers Static Assets 最佳实践](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Astro 静态站部署到 Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/)
- [Workers Static Assets SSG 配置](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/)

### 15.2 Git 仓库

Workers Builds 需要连接 Git 仓库。

支持：

- GitHub。
- GitLab。

不直接支持：

- Gitee。
- 自建 GitHub/GitLab。

当前 `dqxd-mall-en` 目录尚未检测到 Git 仓库，因此正式部署前需要：

1. 建立私有 GitHub 或 GitLab 仓库。
2. 将商城代码推送到仓库。
3. 在 Cloudflare 中连接该仓库。

如果公司只允许 Gitee，则改用 GitHub Actions、GitLab CI 或其他 CI 执行 `wrangler deploy`，但首选仍是私有 GitHub/GitLab 仓库直连 Workers Builds。

官方资料：

- [Workers Builds Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)

### 15.3 Wrangler 配置

项目根目录增加：

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "dqxd-mall-en",
  "compatibility_date": "2026-07-16",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page",
    "html_handling": "auto-trailing-slash"
  }
}
```

注意：

- 不配置 `main`。
- 不配置 D1、R2、KV 或 Queue binding。
- `name` 必须与 Cloudflare Worker 项目名一致。

### 15.4 构建命令

```text
Build command: npm ci && npm run build
Deploy command: npx wrangler deploy
```

Astro 构建输出目录：

```text
dist
```

### 15.5 构建环境变量

```env
MALL_API_BASE_URL=https://api.example.com/app-api
MALL_TENANT_ID=1001
PUBLIC_SITE_URL=https://en.example.com

PUBLIC_SITE_NAME=DQXDAO
PUBLIC_CONTACT_EMAIL=sales@example.com
PUBLIC_CONTACT_PHONE=+85-267111305
PUBLIC_WHATSAPP_URL=https://wa.me/...

PUBLIC_SHOW_PRICE=false
PUBLIC_CURRENCY=CNY
```

注意：

- `MALL_API_BASE_URL` 不包含最后的 `/product/...`。
- `MALL_TENANT_ID` 必须与运营租户一致。
- 不再配置 `SITE_EXPORT_URL` 和 `SITE_BUILD_TOKEN`。
- 不再配置 D1 和 Turnstile。

### 15.6 Deploy Hook

在 Cloudflare：

```text
Workers & Pages
→ dqxd-mall-en
→ Settings
→ Builds
→ Deploy Hooks
```

创建：

```text
Name: ruoyi-product-publish
Branch: main
```

若依后端通过 HTTP POST 调用生成的 Hook URL。

官方资料：

- [Workers Builds Deploy Hooks](https://developers.cloudflare.com/workers/ci-cd/builds/deploy-hooks/)

### 15.7 免费额度

截至本方案日期，Workers Builds 免费计划包括：

- 每月 3,000 构建分钟。
- 同时 1 个构建。
- 单次构建最长 20 分钟。

Workers Static Assets 免费计划主要限制：

- 每个版本最多 20,000 个静态文件。
- 单文件最大 25 MiB。

对于当前商品展示站足够使用。

官方资料：

- [Workers Builds limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- [Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/)

需要支付的主要成本：

- 自有域名注册和续费。

---

## 16. 域名与 HTTPS

### 16.1 域名要求

Workers 自定义域名建议由 Cloudflare 托管 DNS。

示例：

```text
en.example.com
```

步骤：

1. 将域名或子域名接入 Cloudflare。
2. 在 Worker 项目中添加 Custom Domain。
3. 等待 SSL 证书签发。
4. 强制 HTTPS。
5. 将 `PUBLIC_SITE_URL` 设置为正式 HTTPS 地址。

### 16.2 当前“不安全”问题

当前截图中浏览器显示“不安全”，正式上线必须确保：

- 页面使用 `https://`。
- 图片全部使用 `https://`。
- CSS、JS、字体和链接不包含 HTTP 混合内容。
- HTTP 请求重定向到 HTTPS。

---

## 17. 图片方案

本期不使用 R2，直接使用若依返回的：

- `picUrl`
- `sliderPicUrls`
- `sku.picUrl`

上线前必须验证：

- 图片 URL 使用 HTTPS。
- 图片 URL 不会短期过期。
- 海外网络可以访问。
- 图片服务允许公开访问。
- 图片文件大小合理。
- 商品图片修改后 URL 或缓存策略能够正确更新。

需要明确：

静态 HTML 托管到 Cloudflare，并不会自动把第三方图片复制到 Cloudflare。若国内图片服务故障或海外不可达，网页仍能打开，但图片会加载失败。

如果图片海外访问成为问题，再进入第二阶段：

- 同步图片到 R2。
- 使用 Cloudflare Images。
- 使用其他全球图片 CDN。

首期不提前建设。

---

## 18. SEO 与站点质量

构建时自动生成：

- 每个商品独立 HTML。
- 每个分类独立 HTML。
- `title`。
- `meta description`。
- canonical URL。
- Open Graph。
- sitemap。
- robots。
- Product JSON-LD。
- Breadcrumb JSON-LD。

首期字段来源：

| SEO 内容 | 来源 |
|---|---|
| 商品标题 | `name` |
| Meta description | `introduction` |
| Open Graph 图片 | `picUrl` |
| Product URL | `/products/{id}/` |
| Product SKU | 商品 ID，或暂不输出 |

页面要求：

- HTML `lang="en"`。
- 图片有英文 `alt`。
- 商品详情 HTML 标题层级正确。
- 不把库存和价格标记为实时数据。
- 下架商品重新发布后从 sitemap 移除。

---

## 19. 安全方案

### 19.1 商品接口

商品 App 接口是公开展示接口，使用 `@PermitAll` 可以接受，因为返回的是准备公开的商品数据。

仍需遵守：

- 构建只调用 `/page` 和 `/get-detail`。
- 不使用 `list-by-ids` 查询任意商品 ID。
- 不在商城 HTML 中输出 API 地址和 tenant-id。
- 不输出成本价、内部备注、采购信息等内部字段。
- 后端 VO 明确控制公开字段。

### 19.2 租户 ID

`tenant-id` 用于数据选择，不应当作密码。

真正的隔离必须由数据库租户机制完成，不能依赖“别人不知道 tenant-id”。

### 19.3 Deploy Hook

Deploy Hook 是敏感发布凭证：

- 仅保存在若依后端。
- 不写入前端。
- 不写入公开日志。
- 不提交代码仓库。
- 泄露后立即删除并重新生成。

### 19.4 富文本

商品详情在构建时清洗，防止静态页面被注入恶意脚本。

### 19.5 后台权限

- 商品编辑和商城发布使用不同权限。
- 发布接口记录操作人、租户、时间和构建 ID。
- 发布按钮只在配置了商城的租户中显示。

---

## 20. 发布、失败与回滚

### 20.1 正常发布

```text
运营编辑商品
→ 商品上架
→ 点击发布
→ 后台触发 Deploy Hook
→ Cloudflare 构建
→ Astro 拉取数据
→ 新版本部署
→ 自有域名切换到新版本
```

### 20.2 构建失败

可能原因：

- 若依 API 无法访问。
- tenant-id 配置错误。
- 商品数据校验失败。
- 图片 URL 格式错误。
- Node 依赖安装失败。
- Astro 编译失败。
- 构建超过 20 分钟。

系统行为：

- 新版本不上线。
- 当前线上版本继续服务。
- 运营看到“发布任务已提交”不等于“发布成功”。
- 开发或管理员在 Cloudflare Build History 查看错误。

### 20.3 回滚

Workers 每次部署都会生成版本。

出现错误内容时：

```text
Cloudflare Dashboard
→ Worker
→ Deployments
→ 选择上一个正常版本
→ Rollback
```

也可以使用：

```bash
npx wrangler rollback
```

官方资料：

- [Workers Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)

首期由管理员在 Cloudflare 执行回滚；后续再考虑后台一键回滚。

### 20.4 国内系统故障

若依系统故障时：

- 已发布商城继续正常访问。
- 图片是否正常取决于现有图片服务是否独立可用。
- 无法构建和发布新版本。
- 系统恢复后重新发布即可。

---

## 21. 日志与可观测性

### 21.1 若依发布日志

至少记录：

- tenant-id。
- 商城名称。
- 操作用户 ID 和用户名。
- 触发时间。
- Deploy Hook 调用结果。
- Cloudflare build UUID。
- 请求耗时。
- 失败原因。

Deploy Hook 完整 URL 不写入日志。

### 21.2 Cloudflare 构建日志

构建日志应输出：

- 当前商城 tenant-id。
- 分类数量。
- 商品总数。
- 成功获取的详情数量。
- 构建耗时。
- 数据校验错误对应的商品 ID。

不要输出：

- Deploy Hook。
- 后端密钥。
- 其他敏感配置。

### 21.3 站点基础监测

首期可以使用：

- Cloudflare Web Analytics。
- 简单的外部 URL 可用性监测。

至少监测：

- 首页。
- 商品列表页。
- 一个商品详情页。
- sitemap。

---

## 22. 开发任务拆分

### 22.1 商城前端

| 任务 | 说明 | 优先级 |
|---|---|---|
| 重写商品数据层 | 直接调用分类、分页和详情接口 | P0 |
| 增加分页循环 | 每页最多 200 | P0 |
| 增加详情并发控制 | 最大并发 5 | P0 |
| 修改商品 Schema | 适配实际 App VO | P0 |
| 商品路由改为 ID | `[spuCode]` 改为 `[id]` | P0 |
| 修复分类名称 | 去掉 `Swimwear` 占位数据 | P0 |
| 修复价格格式 | 分转货币或隐藏价格 | P0 |
| 静态联系方式 | 移除在线表单依赖 | P0 |
| 富文本清洗 | 防止详情脚本注入 | P0 |
| Wrangler 静态配置 | `dist` 部署到 Workers | P0 |
| 构建错误提示 | 输出具体商品和接口错误 | P1 |
| 图片占位图 | 图片缺失时回退 | P1 |
| SEO 校验 | title、description、JSON-LD | P1 |

### 22.2 若依后端

| 任务 | 说明 | 优先级 |
|---|---|---|
| 新增商城发布接口 | 服务端调用 Deploy Hook | P0 |
| 增加发布权限 | `product:site:publish` | P0 |
| 读取当前 tenant-id | 根据租户选择商城配置 | P0 |
| 发布锁 | 防止连续触发 | P1 |
| 发布日志 | 保存用户、租户和 build UUID | P1 |
| `recordBrowse=false` | 可选，不阻塞首期上线 | P2 |

### 22.3 若依管理端

| 任务 | 说明 | 优先级 |
|---|---|---|
| 增加发布按钮 | 商品列表工具栏 | P0 |
| 权限控制 | 无权限不显示 | P0 |
| 提交状态提示 | 已提交/失败 | P0 |
| 打开商城链接 | 发布后方便检查 | P1 |
| 上次发布信息 | 后续完善 | P2 |

### 22.4 Cloudflare

| 任务 | 说明 | 优先级 |
|---|---|---|
| 创建私有 Git 仓库 | GitHub 或 GitLab | P0 |
| 创建 Worker 项目 | Static Assets | P0 |
| 配置 Builds | 构建和部署命令 | P0 |
| 配置环境变量 | API、tenant、域名、联系方式 | P0 |
| 创建 Deploy Hook | 给若依后端调用 | P0 |
| 绑定自有域名 | HTTPS | P0 |
| 验证回滚 | 确认旧版本可恢复 | P1 |

---

## 23. 推荐实施顺序

### 阶段 1：本地接通数据

1. 商城改为调用实际 App API。
2. 配置测试 tenant-id。
3. 正确显示两个现有英文商品。
4. 修复分类、图片和价格展示。
5. 生成 `/products/{id}/`。
6. 本地完成 `npm run build`。

完成标准：

- 本地构建不再依赖 sample release。
- 商品和分类与若依指定租户一致。
- 下架商品不会进入构建结果。

### 阶段 2：静态 MVP 清理

1. 移除动态询盘入口。
2. 增加静态电话、邮箱和 WhatsApp。
3. 清理 Worker、D1、Turnstile 构建依赖。
4. 增加富文本清洗。
5. 完成 SEO 和 sitemap。

完成标准：

- 整个网站可以只通过静态文件运行。
- 不需要 R2、D1 或 Worker 业务脚本。

### 阶段 3：Cloudflare 部署

1. 创建私有 GitHub/GitLab 仓库。
2. 创建 Cloudflare Worker Static Assets 项目。
3. 配置 Workers Builds。
4. 配置环境变量。
5. 首次构建和部署。
6. 绑定域名和 HTTPS。

完成标准：

- 自有域名正常打开。
- 浏览器不显示“不安全”。
- 海外网络能访问页面和图片。

### 阶段 4：运营发布

1. 若依后端增加发布接口。
2. 管理端增加发布按钮。
3. 配置 Deploy Hook。
4. 添加发布权限和日志。
5. 验证商品新增、修改、下架和重新发布。

完成标准：

- 运营只在若依后台操作。
- 不需要开发人员手工部署商品内容。

### 阶段 5：验收与回滚演练

1. 构造一次错误商品数据，确认构建失败且旧站不受影响。
2. 发布正确数据。
3. 在 Cloudflare 回滚上一版本。
4. 再恢复最新版本。
5. 记录操作手册。

---

## 24. 验收标准

### 24.1 运营验收

- 运营可以在指定租户新增和导入英文商品。
- 运营可以设置分类、图片、详情和 SKU。
- 只有上架商品会出现在商城。
- 点击“发布外网商城”可以提交构建。
- 运营无需登录代码仓库和 Cloudflare。
- 商品下架并发布后，商城不再展示该商品。

### 24.2 页面验收

- 首页、商品列表、分类页、详情页正常。
- 商品分类显示正确，不出现模板占位分类。
- 商品详情和图片对应正确。
- 价格隐藏或正确按货币格式显示。
- 电话、邮箱和 WhatsApp 链接可用。
- 手机、平板和桌面端布局正常。
- 所有页面使用 HTTPS。

### 24.3 数据验收

- 切换不同 tenant-id，构建结果对应不同租户。
- 分页超过 200 条时仍能拉取全部商品。
- 已下架商品不会进入商品分页构建结果。
- 构建失败不会生成不完整的新版本。
- API 错误能定位到接口和商品 ID。

### 24.4 SEO 验收

- 每个商品拥有独立 URL。
- title 和 description 为英文。
- sitemap 包含全部已发布页面。
- 下架商品重新发布后从 sitemap 移除。
- 页面包含 canonical 和基础结构化数据。

### 24.5 部署验收

- Cloudflare 自有域名可访问。
- Deploy Hook 可以触发构建。
- 新构建失败时旧版本继续访问。
- 可以回滚到上一成功版本。
- Build 环境中没有 R2、D1 和询盘依赖。

---

## 25. 风险与处理

| 风险 | 影响 | 首期处理 |
|---|---|---|
| 图片服务海外访问慢 | 页面图片加载慢或失败 | 上线前海外实测，后续再迁移 R2/CDN |
| 构建时国内 API 不可用 | 无法发布新版本 | 构建失败，保留旧版本 |
| 详情接口增加浏览量 | 发布影响浏览统计 | 首期接受，或增加 `recordBrowse=false` |
| 构建期间商品继续修改 | 列表和详情可能不完全一致 | 发布期间暂停编辑，后续再做快照 |
| Deploy Hook 泄露 | 被恶意触发构建 | 仅后端保存，泄露后立即轮换 |
| 商品详情包含危险 HTML | 静态页面脚本注入 | 构建时清洗富文本 |
| 商品数增长过大 | 构建时间和文件数增加 | 分页、并发限制，达到阈值后升级 |
| 运营频繁点击发布 | 浪费构建分钟 | 后端发布锁和按钮防重复 |
| 商品 URL 使用 ID | URL 可读性一般 | 首期接受，后续增加 slug 和重定向 |

---

## 26. 后续升级路线

### 第二阶段

- 发布状态查询。
- 发布成功/失败通知。
- 后台发布历史。
- 预览环境。
- 一键回滚。
- 商品英文 slug。
- SEO 标题和描述独立字段。
- 图片同步到全球 CDN。

### 第三阶段

- 在线询盘。
- Turnstile。
- Worker 接口。
- D1 或 CRM 投递记录。
- 邮件通知和失败重试。

### 第四阶段

- 多语言。
- 多商城配置中心。
- R2 发布快照。
- 严格版本审核。
- 高级搜索和筛选。
- 实时价格、库存或在线交易。

升级原则：

只有实际业务需求出现后才引入动态服务和额外存储，不提前增加复杂度。

---

## 27. 最终技术决策清单

| 决策项 | 最终选择 |
|---|---|
| 商品运营系统 | 现有若依多租户系统 |
| 商品数据源 | 现有 Product App API |
| 商城框架 | Astro 静态生成 |
| 商品列表接口 | `/app-api/product/spu/page` |
| 商品详情接口 | `/app-api/product/spu/get-detail` |
| 分类接口 | `/app-api/product/category/list` |
| `list-by-ids` | 不作为发布主流程 |
| 商品 URL | `/products/{id}/` |
| 发布方式 | 若依后台按钮触发 Deploy Hook |
| Cloudflare 产品 | Workers Static Assets + Workers Builds |
| 数据库 | 不新增 |
| R2 | 不使用 |
| D1 | 不使用 |
| 动态 Worker | 不使用 |
| 询盘 | 静态联系方式 |
| 图片 | 首期复用现有 HTTPS 图片 URL |
| 域名 | 自有域名绑定 Cloudflare |
| HTTPS | Cloudflare 自动证书并强制 HTTPS |
| 回滚 | Cloudflare Worker 版本回滚 |
| 首期新增固定成本 | 除域名外为 0 |

---

## 28. 一句话实施方案

运营在若依指定租户中维护并上架英文商品，点击“发布外网商城”后由若依后端触发 Cloudflare Deploy Hook；Cloudflare 使用 tenant-id 调用现有分类、商品分页和商品详情接口，通过 Astro 生成纯静态商城并部署到 Workers Static Assets，自有域名对外访问，首期不使用 R2、D1 和在线询盘。
