# StoreGuard AI — GoHighLevel (GHL) 专属快照构建总览

本目录包含了 **StoreGuard AI 智能自助仓储管理系统** 的完整 GHL 垂直快照（Snapshot）构建规范与可落地资产。

---

## 📁 快照资产结构

| 文件 | 内容与说明 | 作用与交付形式 |
| :--- | :--- | :--- |
| **`01_CUSTOM_FIELDS_AND_VALUES.md`** | 20+ 仓储专属自定义字段与全局 Custom Values 变量字典 | GHL Settings ➔ Custom Fields / Values |
| **`02_PIPELINES_AND_TAGS.md`** | 选仓入驻管道 + 逾期留置权催缴管道 + 标签分类法 (Taxonomy) | GHL Opportunities ➔ Pipelines & Tags |
| **`03_WORKFLOWS_BUILDER_GUIDE.md`** | 8 大核心自动化工作流节点逐级拆解 (含 Webhook 触发与异常分支) | GHL Automation ➔ Workflows |
| **`04_FLOORPLAN_WIDGET_CODE.html`** | 2D 交互式平面选仓地图源码（支持 SVG 缩放、状态实时渲染、直接唤起订单表单） | GHL Funnel ➔ Custom Code / HTML 元素 |
| **`04_FUNNEL_STRUCTURE.md`** | 5 步无人化自助选仓与签约营销漏斗页面架构设计 | GHL Sites ➔ Funnels |
| **`05_LEASE_AGREEMENT_TEMPLATE.md`** | 具备法律效力的自助仓储电子租约模板（含 SSA 留置权与违禁品免责条款） | GHL Documents & Contracts |
| **`06_MESSAGE_TEMPLATES_LIBRARY.md`** | 全套 SMS 短信、Email 邮件与 AI 语音催缴话术库（符合 10DLC 合规） | GHL Marketing ➔ Templates |

---

## 🛠️ 快照导入与新客户上线 4 步法 (Onboarding SOP)

```
Step 1: 导入快照 (Import Snapshot)
  └─ 在 GHL Agency 后台创建客户子账号 (Sub-Account) 并一键导入 StoreGuard Snapshot。

Step 2: 填充全局变量 (Configure Custom Values)
  └─ 进入 Settings ➔ Custom Values，填入该园区的名称、地址、大门营业时间、客服电话及 IoT Bridge URL。

Step 3: 绑定支付与硬件 (Connect Stripe & IoT Bridge)
  └─ 绑定客户的 Stripe 账户（用于租金循环扣款）；
  └─ 在 StoreGuard IoT Bridge 中绑定该园区的 TTLock / 大门控制器 API Key。

Step 4: 嵌入平面图并上线 (Embed Floorplan & Go Live)
  └─ 将该园区的仓位分布 JSON 填入 2D Floorplan Widget，绑定至 GHL 选仓漏斗，发布上线！
```
