# 05 — 自助仓储标准电子租约模板 (Standard Self-Storage Rental Agreement)

> **使用指引**：在 GHL 后台进入 `Marketing ➔ Documents & Contracts ➔ New Document`，直接复制以下 Markdown / 富文本内容建立模板。模板中已全部预置 GHL 动态合并标签（Merge Tags）。

---

# SELF-STORAGE RENTAL AGREEMENT & OCCUPANCY CONTRACT

**Facility Operator:** {{custom_values.facility_name}}  
**Facility Address:** {{custom_values.facility_address}}  
**Facility Phone:** {{custom_values.facility_phone}} | **Email:** {{custom_values.facility_support_email}}

---

### 1. PARTIES & OCCUPANCY DETAILS

* **Tenant Full Name:** {{contact.name}}
* **Phone Number:** {{contact.phone}}
* **Email Address:** {{contact.email}}
* **Storage Space Assigned:** **Unit {{contact.unit_number}}** (Size: {{contact.unit_size}})
* **Lease Term Start Date:** {{contact.lease_start_date}}
* **Monthly Rental Rate:** **${{contact.monthly_rent}} / Month**
* **Security Deposit Paid:** **${{contact.deposit_amount}}**
* **Monthly Rent Due Date:** 1st Day of each Calendar Month

---

### 2. RECURRING AUTO-PAYMENT & LATE FEES

1. **Automatic Monthly Billing:** Tenant explicitly authorizes Operator to automatically charge the credit/debit card on file on the due date of each month for rent and applicable recurring charges.
2. **Late Fee Policy:** If rent is not received in full by 11:59 PM on the **3rd day** past the due date, a **Late Fee of ${{custom_values.late_fee_amount}}** will be automatically added to the delinquent balance.
3. **Access Suspension & Overlock:**
   * On the **5th day** of non-payment, Tenant's electronic gate code and smart lock credentials will be **automatically deactivated**.
   * On the **14th day** of non-payment, Operator reserves the right to place a physical secondary security lock (**Overlock**) on the unit door.

---

### 3. STATUTORY LIEN & PUBLIC SALE (FORECLOSURE WARNING)

> **IMPORTANT NOTICE PURSUANT TO STATE SELF-SERVICE STORAGE FACILITY ACT:**  
> **OPERATOR HAS A STATUTORY LIEN ON ALL PERSONAL PROPERTY STORED IN OCCUPIED SPACE FOR RENT, LABOR, OR OTHER CHARGES.**  
> IF TENANT IS IN DEFAULT FOR THIRTY (30) DAYS OR MORE, OPERATOR MAY ENFORCE THIS LIEN BY TERMINATING TENANT’S RIGHT OF OCCUPANCY, INVENTORYING PROPERTY, AND ADVERTISING AND SELLING THE STORED PERSONAL PROPERTY AT PUBLIC AUCTION.

---

### 4. STRICT PROHIBITED USES & HAZARDOUS SUBSTANCES

Tenant strictly agrees that the storage unit shall be used **SOLELY FOR STORAGE OF DEAD STORAGE PERSONAL PROPERTY**. The following are strictly prohibited:

* 🚫 **NO HUMAN OR ANIMAL HABITATION:** Living, sleeping, working, lodging, or staying overnight in the unit is strictly prohibited and constitutes immediate grounds for termination, lockout, and law enforcement notification.
* 🚫 **NO HAZARDOUS, FLAMMABLE, OR EXPLOSIVE SUBSTANCES:** Gasoline, oil, fireworks, propane tanks, toxic chemicals, batteries, narcotics, or illegal contraband.
* 🚫 **NO PERISHABLE FOOD OR LIVING ORGANISMS:** Foodstuffs, live plants, or animals that attract pests.

---

### 5. ELECTRONIC ACCESS CREDENTIALS & SECURITY

* Access to the facility gate is granted strictly during posted gate hours: **{{custom_values.facility_gate_hours}}**.
* Tenant shall NOT share their personal Gate Code (`{{contact.gate_access_code}}`) or Smart Lock PIN (`{{contact.unit_lock_pin}}`) with unauthorized third parties.
* Operator is NOT liable for any loss, burglary, water damage, or casualty not caused by Operator's direct gross negligence. Tenant is advised to maintain independent property insurance.

---

### 6. SIGNATURE & ACKNOWLEDGMENT

By signing electronically below, Tenant acknowledges having read, understood, and agreed to all terms, lien disclosures, and automated payment authorizations set forth in this Agreement.

**TENANT SIGNATURE:**

`[ SIGNATURE_FIELD_1 ]`

**Date Signed:** {{date}}  
**IP Address & Verification Token:** `[ IP_TIMESTAMP_STAMP ]`
