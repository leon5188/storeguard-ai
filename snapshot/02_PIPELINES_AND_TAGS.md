# 02 — 管道商机 (Pipelines) 与标签体系 (Tag Taxonomy)

在 StoreGuard AI 体系中，业务被明确划分为两个核心生命周期：**新租客签约入驻 (Move-In)** 与 **逾期催缴与清退 (Delinquency & Lien)**。

---

## 1. 核心商机管道 (Pipelines & Stages)

### 管道 1：`StoreGuard - Move-In & Leasing Pipeline` (签约入驻管道)
用于监控从未接来电、平面图浏览，到实名认证、签约、支付与成功下发门禁的全过程。

```
[1. New Lead (咨询/未付)] ➔ [2. Map Viewed / Unit Selected] ➔ [3. KYC & Contract Signed] ➔ [4. Active Move-In (门禁已下发)] ➔ [5. Move-Out Pending] ➔ [6. Closed / Vacated]
```

| 阶段名称 (Stage Name) | 赢单概率 (Win %) | 颜色代码 | 触发进入条件与系统动作 |
| :--- | :--- | :--- | :--- |
| **1. 🆕 New Lead (咨询/未接)** | 20% | `#64748B` | 用户来电未接或表单咨询；系统自动发送选仓链接 |
| **2. 🗺️ Unit Selected (已选仓)** | 40% | `#F59E0B` | 租客在 2D 平面图点击选定某个仓号，进入结算页 |
| **3. 📝 Signed & KYC Passed** | 70% | `#3B82F6` | 身份证上传通过，电子租约已完成手写签名 |
| **4. 🔑 Active Move-In (已入住)** | 100% (Won) | `#10B981` | 首期租金+押金支付成功；门禁密码已自动下发生效 |
| **5. 📦 Move-Out Notice Given** | 0% | `#8B5CF6` | 租客提前 14 天提交退仓申请，触发验仓与退押流程 |
| **6. 🏁 Completed / Vacated** | 0% (Closed) | `#94A3B8` | 确认清空、密码注销、押金退还，仓位重置为 Vacant |

---

### 管道 2：`StoreGuard - Delinquency & Lien Enforcement` (逾期催缴与留置权管道)
自动驱动逾期账单流转，严格对标美国各州自助仓储协会（SSA）法定催缴与留置拍卖流程。

```
[1. Grace Period (Day 1-2)] ➔ [2. Late Fee Added (Day 3-4)] ➔ [3. Access Suspended (Day 5-13)] ➔ [4. Physical Overlock (Day 14-29)] ➔ [5. Lien Auction Notice (Day 30+)] ➔ [6. Cured (已结清恢复)]
```

| 阶段名称 (Stage Name) | 触发条件 (Trigger) | 硬件状态 | 自动化动作与法务要求 |
| :--- | :--- | :--- | :--- |
| **1. ⚠️ Grace Period (Day 1-2)** | 自动扣款失败（到期日+1） | 正常出入 | 温馨短信+邮件提醒，更新信用卡链接 |
| **2. ⏳ Late Fee Added (Day 3-4)** | 逾期达 3 天未付 | 正常出入 | 账单追加 $20 滞纳金；触发 AI 语音电话自动催缴 |
| **3. 🔒 Gate Lockout (Day 5-13)** | 逾期达 5 天 | **密码失效/闸机锁定** | Webhook 熔断门禁硬件；发送停权警告短信 |
| **4. 🟡 Physical Overlock (Day 14-29)**| 逾期达 14 天 | **门禁锁定+黄色封条** | 派发管理员挂锁 Task；寄送正式法定违约通告信 |
| **5. ⚖️ Lien & Public Auction (Day 30+)**| 逾期达 30 天 | **全权封禁** | 依据州留置权法生成拍卖公证书；没收押金清仓拍卖 |
| **6. ✅ Cured & Reinstated (已结清)** | 欠费+滞纳金全额补齐 | **3秒内秒级解封** | 移出催缴管道；重新下发门禁密码；回归正常租期 |

---

## 2. 标签分类法 (Tag Taxonomy)

所有标签均采用 `模块:状态` 的规范命名，确保工作流触发清晰、不冲突：

```
sg:lead               # 新建潜在客户
sg:unit_selected      # 已在平面图选仓
sg:kyc_verified       # 身份证件审核通过
sg:contract_signed    # 电子合同签署完成
sg:active_tenant      # 正常活跃租客

sg:billing_due        # 账单即将到期 (T-5天)
sg:payment_failed     # 自动扣款失败
sg:dunning_d1         # 逾期第 1 天已通知
sg:late_fee_applied   # 已追加滞纳金
sg:gate_locked        # 硬件门禁已注销停权
sg:overlock_hung      # 已挂物理黄色锁
sg:lien_notice_sent   # 法定留置函已送达
sg:auction_queued     # 进入拍卖队列

sg:vip_247_access     # 享有 24 小时出入特权 (非 VIP 限制夜间出入)
```
