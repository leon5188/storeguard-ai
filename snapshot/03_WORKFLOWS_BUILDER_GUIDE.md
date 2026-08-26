# 03 — 8 大核心自动化工作流构建全景指南 (Workflows Builder)

在 GHL 中，工作流是 StoreGuard AI 实现无人化运营的**大脑与执行中枢**。本指南按照节点顺序（从触发器到分支动作）详细定义了 8 套核心自动化工作流。

---

## 目录
* **WF-1: 签约支付成功 ➔ 门禁密码秒发与欢迎 (Move-In Provisioning)**
* **WF-2: 大门密码 24/7 智能秒回 (Gate Code Rescue)**
* **WF-3: 每月自动租金代扣与到期预警 (Recurring Invoicing)**
* **WF-4: 逾期第 1~4 天宽限期催缴与滞纳金 (Dunning & Late Fee)**
* **WF-5: 逾期第 5 天硬件门禁熔断锁定 (Hardware Gate Lockout)**
* **WF-6: 逾期第 14~30 天物理封条与法定留置权拍卖 (Lien Law Cascade)**
* **WF-7: 逾期补缴 ➔ 3 秒全自动解封闭环 (Instant Pay-to-Unlock)**
* **WF-8: 下班后未接来电自动报价与选仓漏斗 (After-Hours Move-In)**

---

### WF-1: 签约支付成功 ➔ 门禁密码秒发与欢迎 (Move-In Provisioning)

* **Trigger (触发器)**: 
  * GHL `Payment Received` (Filter: Product = Storage Unit Subscription)
* **Enrollment**: 允许重复触发（每次新开仓位均可触发）
* **节点执行顺序**:
  1. **Update Contact Field**:
     * `occupancy_status` $\leftarrow$ `Active_Good`
     * `delinquent_days` $\leftarrow$ `0`
  2. **Add Tag**: `sg:active_tenant`
  3. **Update Opportunity Stage**:
     * Pipeline: `StoreGuard - Move-In & Leasing Pipeline`
     * Stage: `4. 🔑 Active Move-In`
  4. **Custom Webhook (POST)**:
     * **URL**: `{{custom_values.iot_bridge_endpoint}}/api/access/issue`
     * **Body (JSON)**:
       ```json
       {
         "contact_id": "{{contact.id}}",
         "first_name": "{{contact.first_name}}",
         "phone": "{{contact.phone}}",
         "unit_number": "{{contact.unit_number}}",
         "lease_start_date": "{{contact.lease_start_date}}",
         "lease_end_date": "{{contact.lease_end_date}}",
         "hardware_lock_id": "{{contact.hardware_lock_id}}"
       }
       ```
  5. **Wait**: 等待 3 秒（确保 Bridge 完成 TTLock API 计算并回写字段）。
  6. **Send SMS**:
     ```
     Welcome to {{custom_values.facility_name}}, {{contact.first_name}}! 🎉
     Your unit [{{contact.unit_number}}] is ready!

     🔑 Main Gate Code: {{contact.gate_access_code}}
     🔒 Unit Lock PIN: {{contact.unit_lock_pin}}#
     ⏰ Gate Hours: {{custom_values.facility_gate_hours}}
     📍 Address: {{custom_values.facility_address}}

     Need to view your code anytime? Just text "CODE" to this number!
     ```
  7. **Send Email (Move-In Packet)**:
     * 附件附带已签署的电子合同 PDF 链接 `{{contact.signed_lease_url}}` 及园区出入地图。

---

### WF-2: 大门密码 24/7 智能秒回 (Gate Code Rescue)

* **Trigger**:
  * GHL `Customer Replied`
  * **Filters**:
    * Reply Channel: `SMS`
    * Contains phrase (Any of): `code`, `gate`, `pin`, `password`, `forgot`, `open`, `key`
* **If/Else 分支**:
  * **Branch 1: 正常活跃租客 (`occupancy_status` = `Active_Good`)**
    * **Send SMS (1秒内秒回)**:
      ```
      Hi {{contact.first_name}}, here is your access info for Unit {{contact.unit_number}}:

      🔑 Gate Code: {{contact.gate_access_code}}
      🔒 Unit Lock PIN: {{contact.unit_lock_pin}}#
      ⏰ Gate Hours: {{custom_values.facility_gate_hours}}

      Drive safely! - {{custom_values.facility_name}}
      ```
  * **Branch 2: 逾期被锁定租客 (`occupancy_status` = `Access_Suspended` or `Overlocked`)**
    * **Send SMS**:
      ```
      Hi {{contact.first_name}}, your gate access for Unit {{contact.unit_number}} is currently SUSPENDED due to an overdue balance of {{contact.total_amount_due}}.

      💳 Pay instantly to unlock in 3 seconds:
      {{custom_values.pay_to_unlock_url}}?phone={{contact.phone_raw}}
      ```
  * **Branch 3: 未找到匹配仓位 (陌生号码)**
    * **Send SMS**:
      ```
      Hi! We could not find an active storage unit tied to this phone number. 
      If you need to rent a unit, view our live 2D map here: {{custom_values.online_move_in_url}}
      Or call our office at {{custom_values.facility_phone}}.
      ```

---

### WF-3: 每月自动租金代扣与到期预警 (Recurring Invoicing)

* **Trigger**: 
  * GHL `Date/Time Trigger` (Field: `next_billing_date`, Exact Match: 5 Days Before)
* **节点执行顺序**:
  1. **Send SMS (T-5 提前预告)**:
     ```
     Hi {{contact.first_name}}, this is a friendly reminder that your monthly rent for Unit {{contact.unit_number}} ({{contact.monthly_rent}}) is scheduled for auto-pay on {{contact.next_billing_date}} from your card on file. 
     No action needed! Thank you for storing with {{custom_values.facility_name}}.
     ```
  2. **Wait Until**: 到期日当天上午 06:00 AM
  3. **Stripe Action**: 发起周期性扣款 (Auto-Charge Subscription)
  4. **If/Else 分支 (扣款结果判断)**:
     * **Success (成功)**:
       * Update `next_billing_date` $\leftarrow$ +1 Month
       * Update `occupancy_status` $\leftarrow$ `Active_Good`
       * Send Email: 发送月度收据 Receipt
     * **Failed (失败)**:
       * Add Tag: `sg:payment_failed`
       * 自动将联系人加入 **WF-4 催缴工作流**

---

### WF-4: 逾期第 1~4 天宽限期催缴与滞纳金 (Dunning & Late Fee)

* **Trigger**: 
  * GHL Tag Added: `sg:payment_failed`
* **节点执行顺序**:
  1. **Update Contact**:
     * `occupancy_status` $\leftarrow$ `Grace_Period`
     * `delinquent_days` $\leftarrow$ `1`
  2. **Update Opportunity Stage**:
     * Pipeline: `StoreGuard - Delinquency & Lien Enforcement`
     * Stage: `1. ⚠️ Grace Period (Day 1-2)`
  3. **Send SMS (Day 1 友好催款)**:
     ```
     Hi {{contact.first_name}}, your auto-pay for Unit {{contact.unit_number}} was declined. 
     Please update your payment method here to prevent late fees or gate lockout:
     {{custom_values.pay_to_unlock_url}}?phone={{contact.phone_raw}}
     ```
  4. **Wait**: 48 小时 (Day 3 上午 09:00 AM)
  5. **If/Else 检查**: 客户是否已付清？
     * 若已付清 $\rightarrow$ 退出工作流。
     * 若仍未付清:
       * Update `delinquent_days` $\leftarrow$ `3`
       * Update Opportunity Stage $\rightarrow$ `2. ⏳ Late Fee Added (Day 3-4)`
       * **Invoice Action**: 追加滞纳金（`{{custom_values.late_fee_amount}}`，例如 +$20）
       * **Send SMS (Day 3 滞纳金追加警示)**:
         ```
         URGENT: A ${{custom_values.late_fee_amount}} late fee has been applied to Unit {{contact.unit_number}}. Total balance due: {{contact.total_amount_due}}.
         Gate access will be SUSPENDED in 48 hours if unpaid.
         Pay now: {{custom_values.pay_to_unlock_url}}?phone={{contact.phone_raw}}
         ```
       * **Trigger AI Voice Call (自动语音催缴)**:
         * 自动外呼租客手机：“您好，这里是 {{custom_values.facility_name}}，您的仓位已产生逾期，请及时处理以免门禁受限。”

---

### WF-5: 逾期第 5 天硬件门禁熔断锁定 (Hardware Gate Lockout)

* **Trigger**:
  * 逾期进入第 5 天（从 WF-4 自动流转，或通过定时器检查 `delinquent_days` = 5）
* **节点执行顺序**:
  1. **Update Contact**:
     * `occupancy_status` $\leftarrow$ `Access_Suspended`
     * `delinquent_days` $\leftarrow$ `5`
  2. **Add Tag**: `sg:gate_locked`
  3. **Update Opportunity Stage**:
     * Stage: `3. 🔒 Gate Lockout (Day 5-13)`
  4. **Custom Webhook (POST - 硬件停权指令)**:
     * **URL**: `{{custom_values.iot_bridge_endpoint}}/api/access/revoke`
     * **Body (JSON)**:
       ```json
       {
         "contact_id": "{{contact.id}}",
         "unit_number": "{{contact.unit_number}}",
         "hardware_lock_id": "{{contact.hardware_lock_id}}",
         "hardware_pwd_id": "{{contact.hardware_pwd_id}}",
         "reason": "Overdue Delinquency - Day 5"
       }
       ```
  5. **Send SMS (停权通知)**:
     ```
     ACCESS SUSPENDED: Gate and unit lock codes for Unit {{contact.unit_number}} have been deactivated due to non-payment.
     Total balance: {{contact.total_amount_due}}.
     Pay online now to reactivate access in 3 seconds:
     {{custom_values.pay_to_unlock_url}}?phone={{contact.phone_raw}}
     ```

---

### WF-6: 逾期第 14~30 天物理封条与法定留置权拍卖 (Lien Law Cascade)

* **节点执行顺序**:
  1. **Wait Until**: 逾期第 14 天 (Day 14)
  2. **Check Payment**: 若未付清：
     * Update `occupancy_status` $\leftarrow$ `Overlocked`
     * Update Stage $\rightarrow$ `4. 🟡 Physical Overlock (Day 14-29)`
     * **Create GHL Task (指派给驻场管理员/保洁)**:
       * Title: `[OVERLOCK] Hang yellow security lock on Unit {{contact.unit_number}}`
       * Due Date: Today 5:00 PM
     * **Send Formal Certified Email & SMS**:
       * 发送《正式违约通告函 (Notice of Default & Overlock)》。
  3. **Wait Until**: 逾期第 30 天 (Day 30)
  4. **Check Payment**: 若仍未付清：
     * Update `occupancy_status` $\leftarrow$ `Auction_Pending`
     * Update Stage $\rightarrow$ `5. ⚖️ Lien & Public Auction (Day 30+)`
     * **Document Action**: 自动生成符合所在州法律（如 California / Texas Self-Storage Act）的《留置拍卖裁决公告 PDF》。
     * **Internal Notification**: 通知老板启动公共拍卖（如登报公告或上线 StorageTreasures.com 进行竞拍）。

---

### WF-7: 逾期补缴 ➔ 3 秒全自动解封闭环 (Instant Pay-to-Unlock)

* **Trigger**: 
  * GHL `Invoice Paid` (Condition: Contact has tag `sg:gate_locked` or `sg:payment_failed`)
* **节点执行顺序**:
  1. **Remove Tags**: `sg:payment_failed`, `sg:gate_locked`, `sg:overlock_hung`
  2. **Update Contact**:
     * `occupancy_status` $\leftarrow$ `Active_Good`
     * `delinquent_days` $\leftarrow$ `0`
     * `total_amount_due` $\leftarrow$ `0.00`
  3. **Move Opportunity Stage**:
     * Stage: `6. ✅ Cured & Reinstated`
  4. **Custom Webhook (POST - 硬件即刻恢复)**:
     * **URL**: `{{custom_values.iot_bridge_endpoint}}/api/access/reinstate`
     * **Body (JSON)**:
       ```json
       {
         "contact_id": "{{contact.id}}",
         "unit_number": "{{contact.unit_number}}",
         "hardware_lock_id": "{{contact.hardware_lock_id}}"
       }
       ```
  5. **Wait**: 2 秒
  6. **Send SMS (秒级恢复通知)**:
     ```
     PAYMENT CONFIRMED! ✅ Thank you, {{contact.first_name}}. 
     Your access has been RESTORED immediately:

     🔑 Gate Code: {{contact.gate_access_code}}
     🔒 Unit Lock PIN: {{contact.unit_lock_pin}}#

     You may now enter the facility normally. - {{custom_values.facility_name}}
     ```
  7. **If Overlocked (若挂了黄色锁)**:
     * 自动向保洁发任务：“A-102 租客已结清，请在 2 小时内拆除黄色封条锁”。

---

### WF-8: 下班后未接来电自动报价与选仓漏斗 (After-Hours Move-In)

* **Trigger**:
  * GHL `Call Status` (Call Direction = Inbound, Call Status = Busy / No-Answer / Voicemail)
* **节点执行顺序**:
  1. **Wait**: 20 秒（模拟真实响应延迟，避免过于生硬）
  2. **Send SMS (极速转化话术)**:
     ```
     Hi! Sorry we missed your call at {{custom_values.facility_name}}. 
     Were you looking to check pricing or rent a storage unit today? 

     You can view our live 2D facility map and move in 100% online in 2 minutes here:
     {{custom_values.online_move_in_url}}

     What size are you looking for?
     ```
  3. **Create Opportunity**:
     * Pipeline: `StoreGuard - Move-In & Leasing Pipeline`
     * Stage: `1. 🆕 New Lead (咨询/未接)`
