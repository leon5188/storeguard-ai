# 01 — 自定义字段 (Custom Fields) 与全局变量 (Custom Values) 配置字典

在 GHL 中，自定义字段用于精准存储租客的承租仓位、硬件门禁密码、租期和逾期状态；全局变量用于适配不同园区的名称、地址、滞纳金规则和 IoT 中间件地址。

---

## 1. 联系人自定义字段 (Contact Custom Fields)

请在 GHL `Settings ➔ Custom Fields ➔ Add Field` 中创建以下字段（推荐建一个名为 **`StoreGuard Core Data`** 的文件夹归类）：

| 字段显示名 (Field Name) | 字段键 (Key) | 数据类型 (Data Type) | 选项/枚举值 (Options) | 业务说明与用途 |
| :--- | :--- | :--- | :--- | :--- |
| **仓位编号** | `unit_number` | Single Line Text | - | 租客承租的仓号（如 `A-102`、`B-205`） |
| **仓位规格** | `unit_size` | Dropdown (Single) | `5x5 Standard`<br/>`5x10 Standard`<br/>`10x10 Climate Controlled`<br/>`10x15 Climate Controlled`<br/>`10x20 Drive-Up`<br/>`10x30 Vehicle / RV` | 仓型规格与温控类型 |
| **月租金** | `monthly_rent` | Monetary / Number | - | 每月标准租金（如 `145.00`） |
| **押金金额** | `deposit_amount` | Monetary / Number | - | 首期收取的押金（如 `100.00`） |
| **园区大门密码** | `gate_access_code` | Single Line Text | - | 大门出入码（如 `5938#` 或手机后4位+#） |
| **仓门动态密码** | `unit_lock_pin` | Single Line Text | - | 独立仓门 6 位动态密码（由 TTLock 生成） |
| **起租日期** | `lease_start_date` | Date | - | 合同起租生效日 |
| **租约到期日** | `lease_end_date` | Date | - | 当前计费周期的最后一天 |
| **下个扣款日** | `next_billing_date`| Date | - | 预定自动发起代扣的日期 |
| **承租状态** | `occupancy_status` | Dropdown (Single) | `Lead_Inquiry` (咨询中)<br/>`Reserved` (锁定待付)<br/>`Active_Good` (正常在租)<br/>`Grace_Period` (逾期宽限期)<br/>`Access_Suspended` (门禁已冻结)<br/>`Overlocked` (已挂物理封条)<br/>`Auction_Pending` (留置拍卖中)<br/>`Moved_Out` (已退仓) | 核心状态机状态，驱动工作流流转 |
| **逾期天数** | `delinquent_days` | Number | - | 自动累加的逾期天数（0, 1, 3, 5, 14, 30） |
| **待付总金额** | `total_amount_due` | Monetary / Number | - | 包含基础租金 + 滞纳金的总欠款 |
| **实名认证状态** | `id_verified` | Radio Button | `Yes`, `No`, `Failed` | 租客身份证/驾照审核结果 |
| **证件照片链接** | `id_document_url` | File Upload / URL | - | 租客上传的驾照正反面照片存证 |
| **已签署合同 PDF**| `signed_lease_url` | URL | - | GHL Documents 生成并签署后的合同归档地址 |
| **硬件锁具 ID** | `hardware_lock_id` | Single Line Text | - | 对应 TTLock 的设备编号 `lockId` |
| **动态密码 ID** | `hardware_pwd_id` | Single Line Text | - | TTLock 返回的 `keyboardPwdId`（用于停权删除） |

---

## 2. 全局自定义变量 (Custom Values)

进入 GHL `Settings ➔ Custom Values`，为当前运营园区配置全局常量。在所有短信模板、合同模板、工作流中均可直接引用：

```
{{custom_values.facility_name}}
{{custom_values.facility_phone}}
...
```

| 变量名称 (Custom Value Key) | 默认示例值 (Example Value) | 说明 |
| :--- | :--- | :--- |
| `facility_name` | `Oak Ridge Smart Self-Storage` | 园区品牌全称 |
| `facility_address` | `1250 Industrial Blvd, Austin, TX 78701` | 园区物理地址 |
| `facility_phone` | `+1 (512) 555-0199` | 园区官方热线（GHL Twilio 号码） |
| `facility_support_email`| `support@oakridgestorage.com` | 客服与账单沟通邮箱 |
| `facility_gate_hours` | `6:00 AM - 10:00 PM Daily (24/7 for VIP)` | 大门开放时间 |
| `late_fee_amount` | `$20.00` | 逾期固定滞纳金金额 |
| `late_fee_trigger_days`| `3` | 逾期第几天追加滞纳金 |
| `lockout_trigger_days` | `5` | 逾期第几天触发门禁硬件锁定 |
| `overlock_trigger_days`| `14` | 逾期第几天指派管理员挂物理封条锁 |
| `lien_notice_days` | `30` | 逾期第几天依法发起留置权与公共拍卖程序 |
| `iot_bridge_endpoint` | `https://bridge.storeguard-ai.com` | StoreGuard IoT 桥接服务 API 基础地址 |
| `online_move_in_url` | `https://rent.oakridgestorage.com/select-unit` | 2D 选仓与签约在线漏斗网址 |
| `pay_to_unlock_url` | `https://rent.oakridgestorage.com/quick-pay` | 逾期租客扫码补缴账单并秒级解封网址 |

---

## 3. GHL 联系人合并标签速查表 (Merge Tags Cheatsheet)

在编写工作流短信和邮件时，直接复制以下标签：

* 租客姓名：`{{contact.first_name}}` `{{contact.last_name}}`
* 仓位编号：`{{contact.unit_number}}`
* 大门密码：`{{contact.gate_access_code}}`
* 仓门密码：`{{contact.unit_lock_pin}}`
* 当前欠费：`{{contact.total_amount_due}}`
* 租约到期日：`{{contact.lease_end_date}}`
* 园区名称：`{{custom_values.facility_name}}`
* 园区大门开放时间：`{{custom_values.facility_gate_hours}}`
* 补缴解封链接：`{{custom_values.pay_to_unlock_url}}?phone={{contact.phone_raw}}`
