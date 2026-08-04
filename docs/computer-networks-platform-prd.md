# 计算机网络实训平台 — 产品方案

日期：2026-08-03
基线：基于 `计算机组成原理实训平台` 架构复刻
目标路径：`D:\workspace\zcyl_networks\`

---

## 目录

1. [项目定位](#1-项目定位)
2. [架构总览](#2-架构总览)
3. [数据模型设计](#3-数据模型设计)
4. [包转发仿真引擎](#4-包转发仿真引擎)
5. [15 个实验关卡设计](#5-15-个实验关卡设计)
6. [交互画布设计](#6-交互画布设计)
7. [UI 组件与面板设计](#7-ui-组件与面板设计)
8. [视觉设计系统](#8-视觉设计系统)
9. [服务端架构](#9-服务端架构)
10. [课堂管理模式](#10-课堂管理模式)
11. [课程路线与课件](#11-课程路线与课件)
12. [实施路线图](#12-实施路线图)

---

## 1. 项目定位

### 1.1 一句话描述

面向高校**计算机网络**课程的交互式实训平台，学生在可拖拽的拓扑画布上搭建网络、配置设备、观察包转发过程，教师通过课堂模式实时监控和干预。

### 1.2 目标用户

| 角色 | 场景 | 核心需求 |
|------|------|---------|
| 学生 | 课内实验 + 课后自主练习 | 拖拽搭建拓扑、观察数据包流动、获得即时判分与提示 |
| 教师 | 课堂实训组织 + 学情监控 | 一键创建课堂任务、实时查看学生进度热力图、精准定位卡点 |

### 1.3 与现有平台的关系

本平台完全复用「计算机组成原理实训平台」的技术架构，差异仅在于**领域模型**：

| 维度 | 计算机组成原理 | 计算机网络 |
|------|-------------|----------|
| 核心抽象 | 电路图 (门电路 + 信号线) | 拓扑图 (网络设备 + 链路) |
| 仿真引擎 | 固定点传播 (0/1/?) | 离散事件包转发 |
| 节点类型 | AND/OR/NOT/XOR/Adder/Mux | Host/Switch/Router/Firewall/Cloud |
| 边语义 | 1-bit 信号 | 数据包 (带宽/延迟/丢包) |
| 判分依据 | 连接结构 + 真值表测试 | 连接结构 + 连通性测试 + 协议行为 |
| 视觉调性 | teal/gold | cyan/amber |

---

## 2. 架构总览

### 2.1 分层架构

```
┌────────────────────────────────────────────────────────┐
│ UI Layer (React 19 + @xyflow/react)                    │
│ App.jsx → StudentHome / LabPage / TeacherDashboard     │
│   ├── NetworkTopologyCanvas (交互画布)                   │
│   ├── NetworkDeviceNode / NetworkLinkEdge (节点/边)      │
│   └── 专用面板 (子网计算/路由表/ACL/包追踪/协议状态)        │
├────────────────────────────────────────────────────────┤
│ Isomorphic Logic (纯函数，前后端共享)                     │
│   platformLogic.js (15个挑战 + 判分 + 进度)              │
│   network/topologyModel.js (拓扑声明式定义)              │
│   network/packetSimulation.js (包转发仿真引擎)           │
│   network/topologyValidation.js (结构验证)               │
│   network/protocolDefinitions.js (协议状态机)            │
│   subnetCalculator.js / routingTable.js / aclEvaluator.js│
├────────────────────────────────────────────────────────┤
│ Server Layer (Express 5 + better-sqlite3)              │
│   auth.js / security.js (复用)                         │
│   db.js (复用，challenge_id 泛型)                       │
│   submissionValidation.js (服务端权威重判)               │
│   classroomSessionService.js (复用)                    │
└────────────────────────────────────────────────────────┘
```

### 2.2 核心技术决策

1. **同构判分**：前端即时反馈（提升体验），服务端权威重判（不可绕过）。判分逻辑作为纯函数同时被两端引用，服务端丢弃客户端分数重新计算。
2. **State Router**：不使用 react-router，`App.jsx` 内 `activeView` 状态字符串切换视图（home/lab/records/notes/courseware/teacher），实验视图替换整个壳层。
3. **声明式挑战**：每个网络实验定义为纯数据 `{id, title, nodes, requiredEdges, testCases, hints, principle}`，判分/提示/教师分析/路线图全部自动派生。
4. **15s 轮询课堂**：教师和学生各独立轮询，`visibilityState === "visible"` 时触发，无 WebSocket。
5. **幂等提交**：学生生成 `crypto.randomUUID()` 作为 `clientSubmissionId`，服务端唯一索引防重复；提交前写入 `localStorage` 实现离线重试。

### 2.3 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 框架 | React + Vite | 19 + 6 |
| 画布 | @xyflow/react | 12 |
| 3D (可选) | three + @react-three/fiber | — |
| 动画 | gsap | 3 |
| 图标 | @phosphor-icons/react | — |
| 字体 | @fontsource/manrope + newsreader | — |
| 后端 | express + better-sqlite3 | 5 + 12 |
| 测试 | node --test + Playwright | built-in + latest |

---

## 3. 数据模型设计

### 3.1 拓扑模型 (`src/network/topologyModel.js`)

```javascript
// —— 节点类型 ——
const NODE_TYPES = {
  host:       { shape: "roundedRect", icon: "monitor",  color: "navy" },
  switch:     { shape: "rect",        icon: "switch",   color: "cyan" },
  router:     { shape: "hexagon",     icon: "router",   color: "amber" },
  firewall:   { shape: "shield",      icon: "shield",   color: "red" },
  cloud:      { shape: "cloud",       icon: "cloud",    color: "gray" },
};

// —— 端口 ——
// { id, label, direction: "in"|"out"|"bidirectional",
//   portType: "ethernet"|"fiber"|"wireless", speed: "100M"|"1G"|"10G" }

// —— 节点工厂 ——
function hostNode(id, label, x, y, portCount = 2) { ... }
function switchNode(id, label, x, y, portCount = 8) { ... }
function routerNode(id, label, x, y, portCount = 4) { ... }
function firewallNode(id, label, x, y) { ... }
function cloudNode(id, label, x, y) { ... }

// —— 边 ——
// {
//   id, from: { nodeId, portId }, to: { nodeId, portId },
//   linkType: "ethernet"|"fiber"|"wireless",
//   properties: { bandwidth: "100M", latency: 5, packetLoss: 0 },
//   hint: { type: "missing_link"|"wrong_device", message: "主机A未连接到交换机" }
// }

// —— 测试用例 ——
// testCase = {
//   name: "主机A ping 主机B",
//   inputs: { "host-a.eth0": { type: "icmp-echo", dst: "192.168.1.2", ttl: 64 } },
//   expected: { "host-b.eth0": { delivered: true, hops: 1 } },
// }
// hiddenTestCases 仅服务端可见，防作弊
```

### 3.2 包数据结构

```javascript
// Packet = {
//   id: string,                    // UUID
//   type: "icmp-echo" | "icmp-reply" | "arp-request" | "arp-reply" |
//         "dhcp-discover" | "dhcp-offer" | "dhcp-request" | "dhcp-ack" |
//         "dns-query" | "dns-response" |
//         "tcp-syn" | "tcp-synack" | "tcp-ack" | "tcp-fin" |
//         "http-request" | "http-response",
//   src: { ip, mac, port },
//   dst: { ip, mac, port },
//   ttl: number,                   // 默认 64
//   size: number,                  // bytes
//   seq: number,                   // TCP 序列号
//   ack: number,                   // TCP 确认号
//   flags: string[],               // ["syn","ack"] 等
//   payload: object,               // 协议特定数据
// }
```

### 3.3 仿真返回值

```javascript
// SimulationResult = {
//   status: "ok" | "error",
//   errors: [{ type, message, nodeId, portId }],
//   portStates: Map<"nodeId.portId", PortState>,
//   events: PacketEvent[],          // 按时间排序的事件日志
//   statistics: {
//     totalPackets: number,
//     delivered: number,
//     dropped: number,
//     avgLatency: number,            // 平均跳数 × 单跳延迟
//     avgHops: number,
//   },
// }
//
// PortState = {
//   signal: "idle" | "transmitting" | "receiving",
//   lastPacket: Packet | null,
//   queue: Packet[],
//   counters: { sent, received, dropped, bytes },
// }
//
// PacketEvent = {
//   time: number,                    // 仿真时钟 tick
//   type: "enqueue" | "dequeue" | "forward" | "drop" | "deliver" | "broadcast",
//   nodeId: string,
//   portId: string,
//   packet: Packet,
//   reason: string,                  // "TTL过期" | "MAC表命中" | "路由: 192.168.1.0/24" | "ACL拒绝"
// }
```

### 3.4 挑战定义 (`platformLogic.js` CHALLENGES)

```javascript
// 每项 = {
//   id: "host-switch",
//   title: "主机通过交换机通信",
//   shortTitle: "交换机",
//   goal: "将两台主机连接到交换机，观察帧交换过程。",
//   objective: "理解交换机的MAC地址学习和帧转发机制。",
//   estimatedMinutes: 15,
//   requiredConnections: ["主机A->交换机:Port1", "主机B->交换机:Port2"],
//   components: [
//     { name: "主机A", pins: "eth0", description: "发送ICMP Echo的主机" },
//     { name: "主机B", pins: "eth0", description: "接收ICMP Echo的主机" },
//     { name: "交换机", pins: "Port1/Port2/Port3/Port4", description: "8口千兆交换机" },
//   ],
//   hints: {
//     "主机A->交换机:Port1": { type: "missing_link", message: "主机A还没有连接到交换机，数据帧无法发出。" },
//     "主机B->交换机:Port2": { type: "missing_link", message: "主机B还没有连接到交换机，无法接收数据帧。" },
//   },
//   summary: "你成功搭建了第一个以太网拓扑！主机A发出的ICMP Echo请求经过交换机转发到达主机B。",
//   principle: "交换机通过学习源MAC地址建立MAC地址表。收到帧后查表：已知目的MAC → 单播转发到对应端口；未知或广播 → 泛洪到除入端口外的所有端口。",
// }
```

### 3.5 进度模型 (与现有一致)

```javascript
// { status: "locked"|"in-progress"|"completed", attempts, errors: [errorType],
//   completedAt, bestScore, timeSpentMinutes }
// buildInitialProgress() → 第1关 in-progress，其余 locked
// recordAttempt() → 更新进度 + 过关解锁下一关
```

---

## 4. 包转发仿真引擎

### 4.1 核心算法

```
function simulateTopology(model, studentEdges, inputs):
  // Phase 1: 结构验证
  validation = validateTopologyStructure(model, studentEdges)
  if validation.errors.length > 0 → return { status: "error", errors }

  // Phase 2: 初始化
  portStates = Map()    // "nodeId.portId" → PortState
  events = []
  tick = 0
  seed input packets from inputs{} into source ports

  // Phase 3: 离散事件循环
  while tick < 100 AND not stable:
    changed = false

    // 3a. 每个节点处理其各端口的队列
    for each (nodeId, portId, queue) in portStates:
      while queue.length > 0:
        packet = queue.dequeue()
        action = NODE_FORWARDERS[nodeType](node, portId, packet, state)
        events.push({ time: tick, type: action.type, ... })
        if action.type === "deliver" → record delivery
        if action.type === "drop" → record drop
        if action.type === "forward" → enqueue to target port
        if action.type === "broadcast" → enqueue to all ports except source
        changed = true

    // 3b. 跨链路传播
    for each studentEdge (from → to):
      move packets from fromPort.queue → toPort.queue (add link latency to tick)

    // 3c. 检查稳定
    if not changed → break
    tick++

  // Phase 4: 结果聚合
  return { portStates, events, statistics }
```

### 4.2 设备转发函数

```javascript
const NODE_FORWARDERS = {

  // —— 主机 ——
  host({ node, port, packet }):
    if packet.dst.ip === node.config.ip:
      return { type: "deliver", reason: "本地交付" }
    gatewayPort = node.ports.find(p => p.id === node.config.gatewayPort)
    return { type: "forward", targetPort: gatewayPort, reason: "转发到默认网关" }

  // —— 交换机 ——
  switch({ node, port, packet, macTable }):
    // 学习源MAC
    macTable.learn(packet.src.mac, port.id)

    if isBroadcast(packet.dst.mac):
      return { type: "broadcast", except: port.id, reason: "广播帧泛洪" }

    targetPort = macTable.lookup(packet.dst.mac)
    if not targetPort:
      return { type: "broadcast", except: port.id, reason: "未知单播泛洪" }

    return { type: "forward", targetPort, reason: "MAC表命中" }

  // —— 路由器 ——
  router({ node, port, packet, routingTable, arpTable }):
    if packet.ttl <= 0:
      return { type: "drop", reason: "TTL过期(跳数超限)" }

    packet.ttl -= 1
    route = longestPrefixMatch(routingTable, packet.dst.ip)

    if not route:
      return { type: "drop", reason: "无路由匹配 → 丢弃" }

    // 查ARP表获取下一跳MAC
    nextHopMac = arpTable.lookup(route.nextHop)
    if not nextHopMac:
      return { type: "drop", reason: "ARP未解析 → 丢弃" }

    return { type: "forward", targetPort: route.outPort,
             reason: `路由: ${route.network}/${route.prefixLen} → ${route.nextHop}` }

  // —— 防火墙 ——
  firewall({ node, port, packet, aclRules }):
    for rule in aclRules:
      if matches(rule, packet):
        if rule.action === "permit":
          outsidePort = node.ports.find(p => p.id === node.config.outsidePort)
          return { type: "forward", targetPort: outsidePort, reason: "ACL允许" }
        else:
          return { type: "drop", reason: `ACL拒绝 (规则: ${rule.name})` }

    return { type: "drop", reason: "隐式拒绝 (未匹配任何允许规则)" }

  // —— 互联网云 ——
  cloud({ node, port, packet }):
    return { type: "deliver", latency: 50, reason: "经过互联网云传输" }
}
```

### 4.3 未知传播 vs 确定性失败

电路仿真器用 `"unknown"` 信号表示缺失连接（显示 `?`）。网络仿真器不同 —— 缺少路由/ARP/ACL 直接导致 `"drop"` + 明确的原因文本，因为网络行为是确定的。这对教学更友好：学生看到清晰的原因（"TTL过期"、"无路由"），而不是模糊的 `?`。

---

## 5. 15 个实验关卡设计

### 5.1 关卡总览

```
学习路线 (从左到右)：
┌──────────────────────────────────────────────────────────────────────┐
│  基础      │  数据链路层  │     网络层      │  传输/应用层 │  安全    │
│            │             │                  │             │         │
│ ①网络概览  │ ④VLAN配置   │ ⑥IP路由基础      │ ⑧DHCP协议   │ ⑫ACL防火墙│
│ ②交换机通信 │ ⑤ARP协议    │ ⑦子网路由        │ ⑨DNS协议    │ ⑮企业网设计│
│ ③子网基础  │             │ ⑬NAT配置        │ ⑩TCP三次握手 │         │
│            │             │ ⑭静态路由        │ ⑪TCP流量控制 │         │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.2 逐关详述

---

#### ① 认识计算机网络 `network-overview`

| 属性 | 内容 |
|------|------|
| **类型** | 拓扑探索（无严格判分） |
| **用时** | 10min |
| **目标** | 将 PC/手机/服务器连接到交换机，观察数据帧交换 |
| **教学点** | OSI 七层模型、TCP/IP 四层对比、网络边缘与核心、接入网/城域网/广域网 |
| **画布** | 预置：1台交换机 + 3台Host (PC/手机/Web服务器)，学生补充缺失的 3 条链路 |
| **测试** | ①PC ping 手机 → 通 ②PC 访问 Web 服务器 → 通 |
| **反馈** | 每条链路接通后显示各层协议封装/解封装动画 |

---

#### ② 主机通过交换机通信 `host-switch`

| 属性 | 内容 |
|------|------|
| **类型** | 拓扑连线 |
| **用时** | 15min |
| **目标** | 连接主机A→交换机←主机B，观察帧交换和 MAC 地址学习过程 |
| **教学点** | MAC 地址 (48bit)，交换机 MAC 表学习，单播/广播/未知单播泛洪 |
| **组件** | 主机A (IP:192.168.1.1, MAC:AA:AA:AA:AA:AA:01), 主机B (IP:192.168.1.2, MAC:BB:BB:BB:BB:BB:01), 交换机 (4口) |
| **画布** | 空画布，左侧设备托盘 |
| **测试** | ①主机A ping 主机B → 通 (hops=1) ②主机A 发 ARP 广播 → 主机B 收到 |
| **隐藏测试** | ③广播帧泛洪 → 除入端口外所有端口收到 |

---

#### ③ 子网划分基础 `subnet-basics`

| 属性 | 内容 |
|------|------|
| **类型** | 计算器（无画布） |
| **用时** | 15min |
| **目标** | 给定 192.168.1.0/26，计算出网络地址、广播地址、可用IP范围、子网数量 |
| **教学点** | CIDR 记法、子网掩码、网络地址 = IP & mask、广播地址、通配符掩码 |
| **面板** | `SubnetCalculatorPanel` — 输入 IP/CIDR，显示算表，学生填空 |
| **判分** | 每项正确得 20 分 (网络地址/广播/首主机/末主机/主机数) |

---

#### ④ VLAN 配置 `vlan-config`

| 属性 | 内容 |
|------|------|
| **类型** | 拓扑+配置 |
| **用时** | 20min |
| **目标** | 在 1 台交换机上配置 2 个 VLAN (10/20)，将 4 台主机接入对应 access 口，配置 trunk 口连接路由器 |
| **教学点** | 802.1Q, access vs trunk, VLAN ID, 广播域隔离, 跨VLAN需要路由 |
| **测试** | ①同VLAN主机互相ping → 通 ②跨VLAN主机ping → 不通 ③添加路由器后 → 通 |

---

#### ⑤ ARP 地址解析 `arp-protocol`

| 属性 | 内容 |
|------|------|
| **类型** | 协议仿真 |
| **用时** | 15min |
| **目标** | 观察主机A向同网段主机B发送数据前，ARP 请求/应答的完整过程 |
| **教学点** | ARP request (广播, 问"谁的IP是x?"), ARP reply (单播, 答"是我, MAC是y"), ARP 表缓存 |
| **画布** | 预置完整拓扑，学生点击"发送数据"触发 ARP 过程 |
| **面板** | `ProtocolStatePanel` — ARP 表实时状态，报文内容展示 |
| **判分** | 回答 ARP 报文结构填空题 (操作码/源MAC/目的MAC/源IP/目的IP) |

---

#### ⑥ IP 路由基础 `ip-routing-basic`

| 属性 | 内容 |
|------|------|
| **类型** | 拓扑连线 |
| **用时** | 15min |
| **目标** | 搭建 主机A→路由器R1→路由器R2→主机B 两跳路径，理解包转发过程中 IP 不变、MAC 逐跳改变 |
| **教学点** | 下一跳路由、默认网关、TTL、最长前缀匹配、IP不变/MAC变 |
| **测试** | ①主机A ping 主机B → 通 (hops=2) ②主机A traceroute → 显示 R1→R2→B |
| **面板** | `PacketTracePanel` — 每跳显示: 入接口/出接口/TTL/MAC变化 |

---

#### ⑦ 子网间路由 `subnet-routing`

| 属性 | 内容 |
|------|------|
| **类型** | 拓扑+计算+配置 |
| **用时** | 20min |
| **目标** | 给定 192.168.0.0/24，划分为 4 个子网（/26），为每个子网配置路由表项 |
| **教学点** | 定长子网划分、路由器接口 IP 规划、直连路由 vs 静态路由 |
| **组件** | 路由器 (3 接口，每个连一个子网)，12 台主机分属 4 个子网 |
| **判分** | 子网划分正确性 + 路由表配置正确性（最长前缀匹配测试） |

---

#### ⑧ DHCP 动态配置 `dhcp-protocol`

| 属性 | 内容 |
|------|------|
| **类型** | 协议仿真 |
| **用时** | 15min |
| **目标** | 观察新主机接入网络后 DHCP DORA 四步 (Discover→Offer→Request→Ack) 获取IP |
| **教学点** | DHCP Discover (广播, src=0.0.0.0:68 dst=255.255.255.255:67), Offer, Request, Ack; 租约与续租 |
| **画布** | 预置: DHCP服务器 + 交换机 + 新主机(未配置IP) |
| **面板** | `ProtocolStatePanel` — DHCP 状态转换图 (INIT→SELECTING→REQUESTING→BOUND→RENEWING→REBINDING) |

---

#### ⑨ DNS 域名解析 `dns-protocol`

| 属性 | 内容 |
|------|------|
| **类型** | 协议仿真 |
| **用时** | 15min |
| **目标** | 追踪 www.example.com 的完整 DNS 解析链路：本地DNS→根→.com TLD→权威 |
| **教学点** | 迭代查询 (非递归)，DNS 记录类型 (A/AAAA/CNAME/MX/NS)，TTL 缓存 |
| **画布** | 预置: 主机 + 本地DNS + 根DNS + .com TLD + 权威DNS，带箭头连线 |
| **判分** | 按正确顺序排列 DNS 查询步骤 |

---

#### ⑩ TCP 三次握手 `tcp-three-way`

| 属性 | 内容 |
|------|------|
| **类型** | 协议仿真 |
| **用时** | 15min |
| **目标** | 追踪客户端→服务器 TCP 连接建立: SYN→SYN-ACK→ACK |
| **教学点** | seq 序列号 (随机初始ISN), ack 确认号 (seq+1), SYN/ACK/FIN 标志位，TCP 状态机 |
| **画布** | 预置: 客户端 + 服务器，带协议状态面板 |
| **面板** | `ProtocolStatePanel` — TCP 状态机图 (CLOSED→SYN_SENT→SYN_RCVD→ESTABLISHED)，填 seq/ack 值 |

---

#### ⑪ TCP 流量控制 `tcp-flow-control`

| 属性 | 内容 |
|------|------|
| **类型** | 协议仿真 |
| **用时** | 20min |
| **目标** | 观察滑动窗口机制：接收方通告窗口大小，发送方调整速率 |
| **教学点** | 滑动窗口、接收窗口 (rwnd)、累计确认、选择性重传 (SACK) |
| **面板** | 窗口可视化 — 发送窗口/接收窗口的滑动动画 |
| **判分** | 回答：某时刻接收方缓冲满 → 发送方会怎么做？ |

---

#### ⑫ ACL 防火墙规则 `acl-firewall`

| 属性 | 内容 |
|------|------|
| **类型** | 配置 |
| **用时** | 20min |
| **目标** | 为防火墙配置 ACL 规则：允许内网 192.168.1.0/24 访问外网 HTTP/HTTPS，拒绝外网主动连接内网 |
| **教学点** | 标准 ACL vs 扩展 ACL，规则顺序 (first-match)，隐式 deny any，入方向/出方向 |
| **面板** | `AclRulePanel` — 拖拽排序规则，实时显示匹配结果 |
| **测试** | ①内网 HTTP 请求 → permit ②外网 SSH 连接内网 → deny ③内网 FTP → deny |

---

#### ⑬ NAT 网络地址转换 `nat-config`

| 属性 | 内容 |
|------|------|
| **类型** | 拓扑+配置 |
| **用时** | 20min |
| **目标** | 配置 SNAT 使内网私有IP主机通过路由器公网IP访问互联网，观察 NAT 转换表 |
| **教学点** | 私有IP范围 (RFC 1918)，SNAT (源地址转换)，DNAT (端口映射)，NAT 表 |
| **面板** | NAT 转换表实时显示: 内网IP:Port → 公网IP:Port |
| **测试** | ①内网主机访问外网 → 通 (源IP已转换) ②外网访问路由器80端口 → 转发到内网 Web 服务器 |

---

#### ⑭ 静态路由配置 `static-routing`

| 属性 | 内容 |
|------|------|
| **类型** | 拓扑+配置 |
| **用时** | 25min |
| **目标** | 为包含 4 台路由器的拓扑手动配置静态路由，实现全网互通 |
| **教学点** | 直连路由 vs 静态路由，默认路由 (0.0.0.0/0)，路由汇总/聚合，路由环路风险 |
| **面板** | `RoutingTablePanel` — 每台路由器的路由表编辑器 |
| **测试** | ①全网主机互通 ②路由聚合后条目数 ≤ 最大值 ③无路由环路 |

---

#### ⑮ 企业网络设计 `network-design`

| 属性 | 内容 |
|------|------|
| **类型** | 综合拓扑（期末考试级别） |
| **用时** | 30min |
| **目标** | 从空白画布搭建完整企业网络：3 个部门 VLAN + 核心层/汇聚层/接入层 + 防火墙 + NAT + DHCP + DNS |
| **教学点** | 分层网络设计，VLAN 间路由 (单臂/三层交换)，安全边界，高可用 |
| **判分** | 综合评分 = 拓扑正确(40%) + 连通性测试(30%) + 安全规则(20%) + 设计合理(10%) |

---

## 6. 交互画布设计

### 6.1 `NetworkTopologyCanvas.jsx`

React Flow 画布，完全参照 `CircuitFlowCanvas.jsx` 模式：

```
┌─────────────────────────────────────────────────────────────────┐
│  LabPage (全屏壳层)                                               │
│  ┌─ 顶部栏 ───────────────────────────────────────────────────┐ │
│  │ ←返回  第②关: 主机通过交换机通信  得分:--  提交  撤销/重做 │ │
│  └────────────────────────────────────────────────────────────┘ │
│  ┌──────────┬───────────────────────────┬─────────────────────┐ │
│  │ 关卡列表  │      React Flow 画布       │  右侧检查器          │ │
│  │          │                           │  ┌测试用例 ───────┐  │ │
│  │ ①已完成   │   [主机A] ═══ [交换机] ═══ [主机B]  │ • 连通性测试  │  │ │
│  │ ②进行中   │    设备节点 + 链路拖拽       │   通过:2 失败:0 │  │ │
│  │ ③未解锁   │                           │ • 隐藏测试      │  │ │
│  │ ④...     │   [设备托盘: 主机/交换机/..]  │   通过:1 失败:0 │  │ │
│  │          │                           │  └──────────────┘  │ │
│  │          │                           │  ┌包追踪 ────────┐  │ │
│  │          │                           │  │ T0: A→交换机    │  │ │
│  │          │                           │  │ T1: 交换机→B    │  │ │
│  │          │                           │  │ T2: 已投递      │  │ │
│  │          │                           │  └──────────────┘  │ │
│  └──────────┴───────────────────────────┴─────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 设备节点 `NetworkDeviceNode.jsx`

每种设备类型有独特的视觉形态：

| 设备 | 外形 | 色系 | 默认端口 | 特殊标记 |
|------|------|------|---------|---------|
| 主机 | 圆角矩形 `rx=16` | navy (#0d3b66) | eth0 (1-2个) | 屏幕图标 |
| 交换机 | 矩形 | cyan (#0891b2) | Port1-24 | 端口LED阵列 |
| 路由器 | 六边形 | amber (#d97706) | G0/0, G0/1, ... | 六角形轮廓 |
| 防火墙 | 盾形 | red (#dc2626) | inside, outside, dmz | 盾牌图标 |
| 云 | 云形 SVG path | gray | 1个端口 | 渐变填充 |

端口 Handle:
- 输入端口 (target) = 左侧，绿色圆点
- 输出端口 (source) = 右侧，蓝色圆点
- 双向端口 = 左右各一个，灰色圆点
- 已连接端口 = 实心 + LED 绿灯
- 未连接端口 = 空心 + LED 红灯

### 6.3 链路 `NetworkLinkEdge.jsx`

贝塞尔曲线，带动态可视化：

- **线宽**：按配置带宽缩放 (10M=1px, 100M=2px, 1G=3px, 10G=4px)
- **颜色**：利用率热力图
  - 空闲 (<10%): cyan
  - 低负载 (10-50%): blue
  - 中负载 (50-80%): amber
  - 高负载/拥塞 (>80%): red
- **动画**：小圆点沿贝塞尔曲线从 source→target 移动 (代表数据包)
  - 速度 = 链路带宽比例
  - 颜色 = 包类型 (ICMP=cyan, TCP=amber, HTTP=green)
- **标签**：链路类型 + 实时利用率%，hover 显示包计数
- **交叉桥接**：复用 `wireIntersections.js` 的桥接标记

### 6.4 交互

| 操作 | 行为 |
|------|------|
| 从端口拖拽 | 开始画线，实时预览贝塞尔曲线 |
| 拖到目标端口 | 方向验证 → 建立连线 / 拒绝 + toast 提示 |
| 点击连线 | 选中，显示属性 (LinkInspectorPanel) |
| Delete/Backspace | 删除选中连线 |
| Ctrl+Z / Ctrl+Y | 撤销/重做 (历史栈深度 50) |
| 双击画布 | 添加新设备 (弹出设备选择器) |
| 右键设备 | 设备配置菜单 (IP/MAC/路由表/ACL) |
| 测试用例 Tab | 切换测试用例，实时显示通过/失败 |
| 提交按钮 | 提交当前拓扑，弹出判分报告 |

---

## 7. UI 组件与面板设计

### 7.1 面板总览

LabPage 右侧检查器根据挑战类型动态渲染：

```
挑战类型          → 渲染的面板
─────────────────────────────────────
topology (拓扑)  → 设备检查器 + 链路检查器 + 包追踪
calculator (计算) → 子网计算面板
protocol (协议)  → 协议状态面板 + 包追踪
config (配置)    → 路由表面板 / ACL规则面板 + 链路检查器
comprehensive (综合) → 所有面板可切换
```

### 7.2 面板详情

#### 子网计算面板 `SubnetCalculatorPanel.jsx`

```
┌────────────────────────────────────┐
│ 子网计算器                          │
│                                    │
│ IP/CIDR: [192.168.1.0  ] / [26]   │
│                                    │
│ ┌─ 计算结果 ──────────────────────┐ │
│ │ 子网掩码    255.255.255.192     │ │
│ │ 网络地址    192.168.1.0         │ │
│ │ 广播地址    192.168.1.63        │ │
│ │ 可用IP范围  192.168.1.1 - .62   │ │
│ │ 主机数      62 (2^6 - 2)        │ │
│ │ 子网数      4 (借2位)           │ │
│ │ 通配符掩码  0.0.0.63            │ │
│ └────────────────────────────────┘ │
│                                    │
│ 学生填空 (判分项):                  │
│ 网络地址:   [__________]           │
│ 广播地址:   [__________]           │
└────────────────────────────────────┘
```

#### 路由表面板 `RoutingTablePanel.jsx`

```
┌────────────────────────────────────┐
│ 路由器 R1 路由表                    │
│ ┌──┬────────────┬────────┬───────┐ │
│ │# │ 目的网络    │ 下一跳  │ 出接口 │ │
│ ├──┼────────────┼────────┼───────┤ │
│ │1 │192.168.1.0/│直连    │G0/0   │ │
│ │  │     26     │        │       │ │
│ │2 │192.168.2.0/│.1.2    │G0/1   │ │
│ │  │     26     │        │       │ │
│ │+ │[添加条目]   │        │       │ │
│ └──┴────────────┴────────┴───────┘ │
│                                    │
│ 最长前缀匹配可视化:                  │
│ 目标IP: 192.168.2.15               │
│ ┌─ 匹配过程 ──────────────────────┐│
│ │ 192.168.2.0/26 ← 匹配! → G0/1  ││
│ └────────────────────────────────┘│
└────────────────────────────────────┘
```

#### ACL 规则面板 `AclRulePanel.jsx`

```
┌────────────────────────────────────┐
│ 防火墙 ACL 规则 (入方向)             │
│ ┌──┬──────────┬──────────┬───────┐ │
│ │# │ 动作     │ 条件      │ 匹配  │ │
│ ├──┼──────────┼──────────┼───────┤ │
│ │1 │✓ permit │tcp 80/443│ ● 命中│ │
│ │2 │✗ deny   │tcp 22    │ ○ 未中│ │
│ │3 │✗ deny   │any any   │ ○     │ │
│ │⇅│ 拖拽排序  │          │       │ │
│ └──┴──────────┴──────────┴───────┘ │
│ [+ 添加规则]                        │
│                                    │
│ 规则测试:                           │
│ 源IP: [192.168.1.10]  协议:[tcp]   │
│ 目的IP:[203.0.113.5]   端口:[443 ]  │
│ [测试] → 结果: permit (规则#1)      │
└────────────────────────────────────┘
```

#### 包追踪面板 `PacketTracePanel.jsx`

```
┌────────────────────────────────────┐
│ 📦 包追踪: ICMP Echo (192.168.1.1→.1.2) │
│                                    │
│  T0  ●────────→  主机A eth0        │
│      enqueue ICMP Echo              │
│      dst=192.168.1.2 ttl=64        │
│                                    │
│  T1        ●────→  交换机 Port1     │
│      forward MAC表命中→Port2        │
│                                    │
│  T2              ●→  主机B eth0     │
│      deliver 本地交付               │
│      ✓ 成功投递  hops=1            │
│                                    │
│ ── 统计 ───────────────────────────│
│ 发送:2  投递:1  丢弃:0  重传:0     │
└────────────────────────────────────┘
```

#### 协议状态面板 `ProtocolStatePanel.jsx`

```
┌────────────────────────────────────┐
│ TCP 连接状态机                      │
│                                    │
│ 客户端                    服务器     │
│ CLOSED                    CLOSED   │
│   │SYN(seq=1000)             │      │
│   ▼                          ▼      │
│ SYN_SENT              LISTEN       │
│   │                     │SYN+ACK   │
│   │                     │(seq=5000 │
│   │                     │ ack=1001)│
│   ▼                     ▼          │
│   └─── ACK(seq=1001, ──→ SYN_RCVD  │
│        ack=5001)         │         │
│   ▼                      ▼         │
│ ESTABLISHED ←──→    ESTABLISHED    │
│                                    │
│ seq= ?   ack= ?  (学生填空)         │
└────────────────────────────────────┘
```

#### 设备检查器面板 `DeviceInspectorPanel.jsx`

```
┌────────────────────────────────────┐
│ 🔧 主机A (选中)                     │
│                                    │
│ 设备类型: Host                     │
│ IP地址:   192.168.1.1              │
│ MAC地址:  AA:AA:AA:AA:AA:01       │
│ 默认网关: 192.168.1.254            │
│                                    │
│ 端口状态:                           │
│  eth0 ● 已连接 (→交换机Port1)       │
│       收: 142 发: 86 丢: 0         │
│                                    │
│ ARP表:                             │
│  192.168.1.2 → BB:BB:BB:BB:BB:01  │
│  192.168.1.254→ CC:CC:CC:CC:CC:01 │
└────────────────────────────────────┘
```

---

## 8. 视觉设计系统

### 8.1 设计方向

延续 "Precision Workshop" 概念，从硬件工作台调性调整为**网络运维中心**调性：
- 保持暖白底 + 深色导航 + 毛玻璃面板 + 衬线体标题
- 色相从 teal (硬件/PCB) 偏移到 cyan/blue (网络/连接)
- 设备节点加入行业辨识度（思科蓝、交换机青、路由橙）

### 8.2 色彩令牌

```css
:root {
  /* 原平台 → 网络平台 */
  --navy:    #0d3b66;   /* #143a63 → 深蓝 (略暖) */
  --blue:    #0866bd;   /* #286de8 → 连接蓝 (更标准) */
  --cyan:    #0891b2;   /* #2ba98e → 替换 teal 为 cyan */
  --cyan-soft: #e6f7fb; /* #e5f7f1 → 浅青底色 */
  --amber:   #d97706;   /* #d68f2f → 替换 gold 为 amber (路由) */
  --danger:  #dc2626;   /* 不变 */
  --danger-soft: #fff0ec;
  --ink:     #142a45;
  --muted:   #5e748c;
  --soft:    #eef4fa;   /* #f3f6fa → 偏蓝 */
  --surface: rgba(255,255,255,0.86);
  --line:    rgba(30,60,100,0.1);

  /* 设备配色 */
  --color-host:     #0d3b66;  /* navy */
  --color-switch:   #0891b2;  /* cyan */
  --color-router:   #d97706;  /* amber */
  --color-firewall: #dc2626;  /* red */
  --color-cloud:    #6b7280;  /* gray */

  /* 链路热力 */
  --color-link-idle:      #0891b2;  /* cyan */
  --color-link-low:       #0866bd;  /* blue */
  --color-link-medium:    #d97706;  /* amber */
  --color-link-congested: #dc2626;  /* red */

  /* 包类型 */
  --color-packet-icmp: #0891b2;
  --color-packet-tcp:  #d97706;
  --color-packet-http: #16a34a;
  --color-packet-drop: #dc2626;
}
```

### 8.3 排版 & 间距 (不变)

| Token | 值 |
|-------|---|
| 正文字体 | "Manrope", "Microsoft YaHei", "PingFang SC", sans-serif |
| 标题字体 | "Newsreader", serif (display), letter-spacing -0.03em |
| 圆角 | --radius-xl: 28px, --radius-lg: 22px, --radius-md: 16px |
| 阴影 | --shadow: 0 24px 70px rgba(30,55,90,0.14) |
| 断点 | 1500px / 1180px (icon rail) / 1120px (1-col) / 780px (stack) / 540px |

### 8.4 背景渐变

```css
body {
  background:
    radial-gradient(circle at 7% 8%, rgba(8,145,178,0.15), transparent 28%),
    radial-gradient(circle at 88% 0%, rgba(8,102,189,0.10), transparent 26%),
    linear-gradient(135deg, #fbf6ee 0%, #eef4fa 100%);
}
```

---

## 9. 服务端架构

### 9.1 完全复用现有服务端

现有 `server/` 层设计为泛型——`challenge_id` 是 `TEXT` 类型，不关心具体值。数据库 schema、auth、CSRF、评分验证、课堂会话全部直接复用。

### 9.2 唯一需要修改的文件

| 文件 | 修改内容 |
|------|---------|
| `server/classroomMissionGrading.js` | 添加 `"topology"` 和 `"protocol"` 评分类型 (现有只有 `"participation"` 和 `"circuit"`) |
| `src/shared/classroomMissionDefinitions.js` | 新的网络课堂任务模板 (替换 `"computer-data-flow"`) |
| `server/seedTeacher.js` | 种子数据引用新的网络挑战 ID |
| `server/seedDemoClassroom.js` | 种子演示课堂数据 |

### 9.3 服务端权威判分流程 (不变)

```
POST /api/student/attempts
  → normalizeStudentAttemptPayload()
    → validateChallengeId()  // 关卡是否存在
    → validateLockedStatus() // 是否已解锁
    → size/sanitize checks
    → SERVER-SIDE RE-GRADE:
      → topology/network: validateTopologyStructure + runAllTopologyTests (含 hidden)
      → calculator: validateCalculation
      → protocol: validateProtocolState
    → recordStudentAttempt() // 事务写入 challenge_attempts + student_progress
    → 如果是课堂提交: 走 classroomSessionService.submitAttempt()
```

---

## 10. 课堂管理模式

### 10.1 完全复用

课堂生命周期、状态机、轮询、离线队列、学生网格、热力图、报告面板全部复用现有实现。

### 10.2 网络课堂任务模板

替换现有的 `computer-data-flow` 模板：

```javascript
// "network-switch-lab" (4 阶段)
{
  key: "network-switch-lab",
  version: 1,
  title: "交换式以太网实训",
  stages: [
    { id: "s1", challengeId: "host-switch",       title: "搭建基本拓扑",
      grading: "topology", timeLimitMinutes: 10 },
    { id: "s2", challengeId: "arp-protocol",       title: "观察ARP过程",
      grading: "protocol",  timeLimitMinutes: 10 },
    { id: "s3", challengeId: "vlan-config",        title: "VLAN隔离配置",
      grading: "topology",  timeLimitMinutes: 15 },
    { id: "s4", challengeId: "ip-routing-basic",   title: "跨网段路由",
      grading: "topology",  timeLimitMinutes: 15 },
  ],
  totalDurationMinutes: 50,
  passScore: 70,
}

// "network-routing-lab" (3 阶段)
{
  key: "network-routing-lab",
  version: 1,
  title: "IP路由综合实训",
  stages: [
    { id: "s1", challengeId: "subnet-basics",     title: "子网规划",
      grading: "calculator", timeLimitMinutes: 10 },
    { id: "s2", challengeId: "subnet-routing",     title: "子网间路由",
      grading: "topology",   timeLimitMinutes: 15 },
    { id: "s3", challengeId: "static-routing",     title: "静态路由配置",
      grading: "topology",   timeLimitMinutes: 20 },
  ],
  totalDurationMinutes: 45,
  passScore: 70,
}
```

---

## 11. 课程路线与课件

### 11.1 5 章节学习路线

```
foundation  → l2       → l3            → protocols   → security
(3关)        (2关)      (4关)            (4关)          (2关)
网络基础     数据链路层   网络层与路由      传输/应用层     网络安全与综合
```

### 11.2 8 章课件 (`courseware.js`)

| 章 | 标题 | 关联关卡 |
|----|------|---------|
| 1 | 计算机网络概述 | network-overview |
| 2 | 应用层 (HTTP/DNS/SMTP) | dns-protocol |
| 3 | 传输层 (TCP/UDP) | tcp-three-way, tcp-flow-control |
| 4 | 网络层: 数据平面 (IP/路由) | ip-routing-basic, subnet-routing, static-routing |
| 5 | 网络层: 控制平面 (路由协议) | — (S2 扩展: OSPF/BGP 模拟) |
| 6 | 数据链路层 (MAC/ARP/VLAN/交换机) | host-switch, vlan-config, arp-protocol |
| 7 | 网络安全 (防火墙/ACL/NAT) | acl-firewall, nat-config |
| 8 | 网络设计综合 | network-design |

---

## 12. 实施路线图

### Phase 1: 骨架 + 核心数据模型 (2-3 天)

**目标**: 项目启动，3 个挑战端到端跑通。

**任务**:
1. 创建 `D:\workspace\zcyl_networks\` 骨架 — 从 prototype 复制并删除 CO 特定文件
2. 重写 `platformLogic.js` — 前 3 个挑战: network-overview, host-switch, subnet-basics
3. 实现 `src/network/topologyModel.js` — 节点/端口/边工厂 + 测试用例
4. 实现 `src/network/topologyValidation.js` — 结构验证 + 判分公式
5. 实现简化版 `src/network/packetSimulation.js` — host↔switch↔host
6. 实现 `src/network/reactFlowMapping.js` — model → React Flow
7. 实现 `NetworkTopologyCanvas.jsx` + `NetworkDeviceNode.jsx` + `NetworkLinkEdge.jsx`
8. 更新 `courseRoute.js`、`courseware.js` (前 2 章)
9. 更新 `styles.css` 令牌偏移

**验证**: `npm run dev` 启动 → 第 1-3 关可查看、连线、提交、得分

### Phase 2: 协议仿真引擎 (2-3 天)

**目标**: 完整仿真 + 15 个挑战。

**任务**:
1. 实现 `protocolDefinitions.js` — ARP/DHCP/TCP/DNS 状态机
2. 补全 `packetSimulation.js` — 所有节点转发函数 (host/switch/router/firewall/cloud)
3. 实现 `subnetCalculator.js`、`routingTable.js`、`aclEvaluator.js`
4. 补全 15 个挑战的 topologyModel 定义
5. 补全 `platformLogic.js` 中所有 CHALLENGES + simulateChallenge 逻辑
6. 单元测试覆盖所有模块

**验证**: `node --test src/network/*.test.mjs` → 全绿

### Phase 3: UI 面板 + 视觉动画 (3-4 天)

**目标**: 完整的实验工作台体验。

**任务**:
1. 实现 `SubnetCalculatorPanel.jsx`
2. 实现 `RoutingTablePanel.jsx`
3. 实现 `AclRulePanel.jsx`
4. 实现 `PacketTracePanel.jsx`
5. 实现 `ProtocolStatePanel.jsx`
6. 实现 `LinkInspectorPanel.jsx` + `DeviceInspectorPanel.jsx`
7. `NetworkLinkEdge.jsx` 包动画 (贝塞尔曲线运动圆点)
8. 链路热力着色
9. 设备视觉差异化 (形状/图标)
10. `LabPage.jsx` 按挑战类型渲染对应面板

**验证**: Playwright 截图回归 — 每个挑战类型的画布 + 面板

### Phase 4: 服务器 + 课堂集成 (2-3 天)

**目标**: 完整的学生+教师流程。

**任务**:
1. `classroomMissionGrading.js` — 添加 topology/protocol/calculator 评分
2. `classroomMissionDefinitions.js` — 网络课堂任务模板
3. `submissionValidation.js` — 网络挑战的服务器端判分 (含 hiddenTestCases)
4. 更新 seed 数据
5. 集成测试: 学生登录→进课堂→做实验→提交→教师看热力图→结束→结算

**验证**: `npm run qa:classroom` → 通过

### Phase 5: 课件 + 打磨 (2 天)

**目标**: 完整可交付。

**任务**:
1. 完成 8 章课件内容
2. 课件关联挑战 (linkedChallenges)
3. 中文 UI 全量审查
4. 移动端适配审查
5. Playwright E2E 全量截图回归
6. README / AGENTS.md / 部署说明

---

## 附录: 与现有平台的代码复用率

| 模块 | 复用方式 | 复用率 |
|------|---------|-------|
| auth.js, security.js | 原样复制 | 100% |
| db.js, migrate.js | 原样复制 | 100% |
| app.js, server.js | 原样复制 | 95% (仅评分类型枚举) |
| classroomSession*.js | 原样复制 | 95% |
| assignment*.js | 原样复制 | 100% |
| studentReport.js | 原样复制 | 100% |
| teacherAssistant.js | 挑战 ID 更新 | 90% |
| App.jsx | 导航项/元数据更新 | 70% |
| LabPage.jsx | 画布组件替换 | 60% |
| styles.css | 令牌偏移 | 85% |
| classroom components | 全部复用 | 100% |
| quest components | 全部复用 | 100% |
| teacher components | 全部复用 | 95% |
| auth components | 全部复用 | 100% |
| hooks (useClassroomSession, useTeacherSession) | 全部复用 | 100% |
| **整体** | | **约 70%** |
