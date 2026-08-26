# GoHighLevel 第 4 步结账页（2-Step Order Form）原生视觉搭建教程

为了在 GHL 中使用 **GHL 原生 2 步订单结账组件（带 Stripe 真实划扣、Apple Pay 与按月自动续费）**，同时保持 **StoreGuard AI 高端工业风视觉**，请按照以下 3 分钟搭建步骤操作：

---

## 视觉布局结构

在 GHL 页面编辑器中，创建一个 **2-Column Row（双列布局）**：

```
+-------------------------------------------------------------+
|                StoreGuard Navigation Header                 |
+------------------------------+------------------------------+
|        LEFT COLUMN (50%)     |       RIGHT COLUMN (50%)     |
|                              |                              |
|   [ Custom Code Element ]    |   [ 2-Step Order Form ]      |
|   - Order Summary Card       |   - Step 1: Customer Info    |
|   - Unit & Rate Overview     |   - Step 2: Stripe Payment   |
|   - IoT Instant Access Notice|   - Order Bump: Insurance    |
|                              |                              |
+------------------------------+------------------------------+
```

---

## 🛠️ 3 步落地实操 (Click-by-Click)

### 步骤 1：注入主题定制样式 (Custom CSS)
1. 在 GHL 页面编辑器右上角，点击 **`Settings (⚙️)` ➔ `Custom CSS`**；
2. 打开文件 [`ghl_order_form_theme.css`](file:///Users/peifengni/storeguard-ai/snapshot/funnel_pages/step4_ghl_native_setup/ghl_order_form_theme.css)，将里面的全部 CSS 代码复制粘贴进去并保存；
3. **效果**：GHL 原生原本笨重的蓝色订单框将自动蜕变为 StoreGuard 品牌专属的 `#D2510A` 橙色 + `#191510` 暖黑色高质感界面！

---

### 步骤 2：左侧列放置订单摘要组件 (Left Column Widget)
1. 在左侧列拖入一个 GHL **`Custom Code`** 元素；
2. 打开文件 [`left_column_order_summary.html`](file:///Users/peifengni/storeguard-ai/snapshot/funnel_pages/step4_ghl_native_setup/left_column_order_summary.html)，复制代码粘贴到该 Custom Code 弹窗中；
3. **效果**：左侧将自动根据 URL 参数（`?unit=A-101&price=145`）动态显示租客选择的仓号、月租及安全保障说明。

---

### 步骤 3：右侧列拖入 GHL 原生 2-Step Order Form
1. 在右侧列点击 **`+ Add Element`**，选择 **`2-Step Order`** 拖入；
2. **在右侧属性面板配置**：
   * **Button Color**: 无需手动调，已由 CSS 自动统一度量；
   * **Button Text (Step 1)**: `Proceed to Payment ➔`
   * **Button Text (Step 2)**: `🔒 Pay & Activate Smart Gate PIN`
   * **Form Redirect**: 设置为 `Go to next step in funnel`（即自动前往 Step 5 `/welcome-portal`）；
3. **挂载产品 (Products Tab)**：
   * 退出编辑器，回到 GHL Funnel 的 Step 4 概览页面；
   * 点击顶部的 **`Products`** 标签页，点击 **`+ Add Product`**；
   * 关联我们在你账户中建好的产品：
     * **主产品**：`10x10 Climate Controlled Unit` ($145.00/mo - Recurring)
     * **附加产品**：`Security Deposit` ($100.00 - One Time)
     * **Order Bump**：`Tenant Protection Insurance` ($15.00/mo - Recurring)

---

## 🚀 为什么必须这样搭？

1. **Stripe 原生按月自动扣费**：GHL 原生结账组件会自动在 Stripe 中为该客户创建 `Subscription`（按月循环订阅），下个月 1 号自动划扣，无需人工开发票；
2. **Apple Pay / Google Pay 免密支付**：手机端打开时，GHL 结账组件会自动唤起系统原生 Apple Pay；
3. **秒级 Webhook 联动**：支付成功瞬间，GHL 系统底层自动触发你的 **`WF-1: Move-In Provisioning`** 工作流，通知 IoT 门禁系统下发密码！
