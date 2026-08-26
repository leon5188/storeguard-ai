# 06 — 全套通讯模板库 (SMS, Email, AI Voice Call Scripts)

本库包含 StoreGuard AI 预置的所有客户沟通模板。全部文案采用纯 ASCII 英文编写（防运营商乱码与 10DLC 拦截），并预先嵌入 GHL 合并标签。

---

## 1. SMS 短信模板库 (SMS Templates)

### SMS 1: 签约入住成功 (Move-In Instant Welcome)
```
Welcome to {{custom_values.facility_name}}, {{contact.first_name}}! 🎉
Your unit [{{contact.unit_number}}] is active & ready.

🔑 Main Gate Code: {{contact.gate_access_code}}
🔒 Unit Lock PIN: {{contact.unit_lock_pin}}#
⏰ Gate Hours: {{custom_values.facility_gate_hours}}
📍 Address: {{custom_values.facility_address}}

Tip: Text "CODE" to this number anytime to retrieve your gate code instantly!
```

### SMS 2: 大门密码秒查回复 (Gate Code Lookup Response)
```
Hi {{contact.first_name}}, here is your access info for Unit {{contact.unit_number}}:

🔑 Gate Code: {{contact.gate_access_code}}
🔒 Unit PIN: {{contact.unit_lock_pin}}#
⏰ Hours: {{custom_values.facility_gate_hours}}

Drive safely! - {{custom_values.facility_name}}
```

### SMS 3: 每月自动扣款前 5 天预告 (Pre-Billing Reminder)
```
Hi {{contact.first_name}}, your monthly rent of ${{contact.monthly_rent}} for Unit {{contact.unit_number}} is scheduled for auto-charge on {{contact.next_billing_date}} from your card on file. 
No action required! Thank you for storing with {{custom_values.facility_name}}.
```

### SMS 4: 扣款失败第 1 天友好提醒 (Delinquent Day 1)
```
Hi {{contact.first_name}}, your auto-payment for Unit {{contact.unit_number}} could not be processed. 
Please update your card info here to avoid late fees or access interruption:
{{custom_values.pay_to_unlock_url}}?phone={{contact.phone_raw}}
```

### SMS 5: 逾期第 3 天滞纳金追加警示 (Delinquent Day 3 Late Fee)
```
URGENT: A ${{custom_values.late_fee_amount}} late fee has been added to Unit {{contact.unit_number}}. Total balance due: ${{contact.total_amount_due}}. 
Gate access will be SUSPENDED in 48 hours if unpaid. 
Pay now: {{custom_values.pay_to_unlock_url}}?phone={{contact.phone_raw}}
```

### SMS 6: 逾期第 5 天门禁停权通知 (Delinquent Day 5 Lockout)
```
ACCESS SUSPENDED: Gate & unit lock codes for Unit {{contact.unit_number}} are deactivated due to past-due balance of ${{contact.total_amount_due}}. 
Pay securely online to restore access in 3 seconds:
{{custom_values.pay_to_unlock_url}}?phone={{contact.phone_raw}}
```

### SMS 7: 逾期第 14 天挂锁通告 (Delinquent Day 14 Overlock)
```
FINAL NOTICE: Unit {{contact.unit_number}} has been placed on physical OVERLOCK. Continued non-payment will result in statutory lien foreclosure & public auction pursuant to State Law. 
Call {{custom_values.facility_phone}} or pay immediately: {{custom_values.pay_to_unlock_url}}?phone={{contact.phone_raw}}
```

### SMS 8: 补缴成功秒级恢复 (Instant Reinstatement)
```
PAYMENT CONFIRMED! ✅ Thank you, {{contact.first_name}}. 
Your gate and smart lock access has been RESTORED immediately:

🔑 Gate Code: {{contact.gate_access_code}}
🔒 Unit Lock PIN: {{contact.unit_lock_pin}}#

Thank you for your prompt payment! - {{custom_values.facility_name}}
```

### SMS 9: 下班后来电极速转化 (Missed Call Auto-Responder)
```
Hi! Sorry we missed your call at {{custom_values.facility_name}}. 
Were you looking to check pricing or rent a storage unit today? 

View our live 2D map and move in 100% online in 2 minutes:
{{custom_values.online_move_in_url}}

What size do you need?
```

### SMS 10: 入住 7 天后 Google 5 星好评自动收集 (Review Request)
```
Hi {{contact.first_name}}, hope move-in into Unit {{contact.unit_number}} was smooth! 
If you enjoyed our 24/7 smart entry experience, could you leave us a quick 5-star review? It helps our local team tremendously:
{{custom_values.google_review_link}}
Thank you!
```

---

## 2. 邮件模板 (Email Templates)

### Email 1: 入住欢迎包 (Move-In Welcome Packet)
* **Subject**: `Welcome to {{custom_values.facility_name}}! (Unit {{contact.unit_number}} Access Info & Lease)`
* **Body**:
  ```html
  <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; line-height: 1.6;">
    <h2 style="color: #059669;">Welcome to {{custom_values.facility_name}}! 🎉</h2>
    <p>Dear {{contact.first_name}},</p>
    <p>Your move-in is officially confirmed! Here are your digital access credentials:</p>
    
    <div style="background: #f1f5f9; padding: 18px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 6px 0;"><strong>Assigned Space:</strong> Unit {{contact.unit_number}} ({{contact.unit_size}})</p>
      <p style="margin: 6px 0;"><strong>Main Gate PIN:</strong> <span style="font-size: 18px; color: #059669; font-weight: bold;">{{contact.gate_access_code}}</span></p>
      <p style="margin: 6px 0;"><strong>Smart Lock PIN:</strong> <span style="font-size: 18px; color: #059669; font-weight: bold;">{{contact.unit_lock_pin}}#</span></p>
      <p style="margin: 6px 0;"><strong>Gate Hours:</strong> {{custom_values.facility_gate_hours}}</p>
      <p style="margin: 6px 0;"><strong>Facility Address:</strong> {{custom_values.facility_address}}</p>
    </div>

    <p><strong>Signed Lease Agreement:</strong> You can download and review your executed rental agreement anytime via this link: <a href="{{contact.signed_lease_url}}">View Signed Lease (PDF)</a>.</p>

    <p style="color: #64748b; font-size: 13px; margin-top: 30px;">Need immediate gate assistance? Reply directly to this email or text "CODE" to {{custom_values.facility_phone}}.</p>
  </div>
  ```

### Email 2: 法定违约留置与拍卖预警函 (Notice of Lien & Intent to Sell)
* **Subject**: `LEGAL NOTICE: Notice of Default & Lien Foreclosure - Unit {{contact.unit_number}}`
* **Body**:
  ```html
  <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; line-height: 1.6;">
    <h3 style="color: #dc2626;">OFFICIAL NOTICE OF DEFAULT & INTENT TO ENFORCE STATUTORY LIEN</h3>
    <p><strong>DATE:</strong> {{date}}</p>
    <p><strong>TO TENANT:</strong> {{contact.name}} (Unit {{contact.unit_number}})</p>
    
    <p>Please be advised that your account with {{custom_values.facility_name}} is currently <strong>{{contact.delinquent_days}} DAYS DELINQUENT</strong> in the total amount of <strong>${{contact.total_amount_due}}</strong>.</p>

    <p>Pursuant to the State Self-Service Storage Facility Act, you are hereby notified that the Operator has placed a statutory lien upon all personal property stored within Unit {{contact.unit_number}}.</p>

    <p><strong>ACTION REQUIRED:</strong> To prevent public sale/auction of your stored property, the total past-due balance must be paid in full immediately.</p>

    <div style="text-align: center; margin: 25px 0;">
      <a href="{{custom_values.pay_to_unlock_url}}?phone={{contact.phone_raw}}" style="background: #dc2626; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">PAY PAST DUE BALANCE NOW</a>
    </div>

    <p style="font-size: 12px; color: #64748b;">If you believe this notice was sent in error, please contact management immediately at {{custom_values.facility_phone}}.</p>
  </div>
  ```

---

## 3. AI 语音自动催缴话术 (AI Voice Call Script - Day 3 Delinquency)

由 GHL Conversation AI / Twilio IVR 自动外呼执行：

> *"Hello, this is the automated billing assistant calling from {{custom_values.facility_name}} for {{contact.first_name}} regarding storage unit {{contact.unit_number}}.*  
> *We noticed your monthly payment of ${{contact.monthly_rent}} was declined, and a late fee has been applied.*  
> *To avoid gate access suspension on day five, please press 1 to receive a fast-pay link on your mobile phone right now, or press 2 to speak with our office.*  
> *Thank you, and have a great day."*
