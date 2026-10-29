import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadFromDB, saveToDB } from './db-sync-utils'

const ARTICLES_DATA_TYPE = 'knowledgeArticles'

export const useKnowledgeBaseStore = defineStore('knowledgeBase', () => {
  const articles = ref([])
  const loading = ref(false)
  
  // 初始化时从数据库加载，失败则使用默认文章
  ;(async () => {
    try {
      await loadFromDB(ARTICLES_DATA_TYPE, articles)
      // 如果数据库中没有文章，则加载默认文章
      if (!articles.value || articles.value.length === 0) {
        articles.value = getDefaultArticles()
        await saveToDB(ARTICLES_DATA_TYPE, articles.value)
      }
    } catch (e) {
      console.error('加载知识库文章失败:', e)
      articles.value = getDefaultArticles()
    }
  })()

  function getDefaultArticles() {
    const now = Date.now()
    const articles = []
    
    // 常见问题 (10条)
    articles.push({
      id: '1',
      title: '如何解决设备SSH连接失败问题',
      category: '常见问题',
      content: `## SSH连接失败排查步骤

### 1. 网络连通性检查
\`\`\`bash
ping <设备IP>
telnet <设备IP> 22
\`\`\`

### 2. 检查设备SSH服务状态
\`\`\`bash
display ssh server status
\`\`\`

### 3. 检查防火墙规则
\`\`\`bash
display acl all
\`\`\`

### 4. 检查用户认证配置
\`\`\`bash
display local-user
\`\`\`

### 5. 重启SSH服务
\`\`\`bash
undo ssh server enable
ssh server enable
\`\`\``,
      tags: ['SSH', '连接', '故障'],
      createdBy: '系统',
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '2',
      title: '设备无法获取IP地址怎么办',
      category: '常见问题',
      content: `## DHCP获取失败排查

### 1. 检查DHCP客户端状态
\`\`\`bash
display dhcp client
\`\`\`

### 2. 检查VLAN配置
\`\`\`bash
display vlan brief
\`\`\`

### 3. 检查DHCP中继配置
\`\`\`bash
display ip relay interface
\`\`\`

### 4. 检查DHCP服务器状态
\`\`\`bash
display ip pool
\`\`\`

### 5. 手动配置IP测试
\`\`\`bash
interface Vlanif1
 ip address 192.168.1.100 255.255.255.0
\`\`\``,
      tags: ['DHCP', 'IP', '网络'],
      createdBy: '系统',
      createdAt: new Date(now - 86400000).toISOString(),
      updatedAt: new Date(now - 86400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '3',
      title: '端口无法UP的常见原因',
      category: '常见问题',
      content: `## 端口UP状态排查

### 1. 检查物理连接
- 确认网线已正确连接
- 检查网线是否损坏
- 尝试更换端口

### 2. 检查端口状态
\`\`\`bash
display interface brief
\`\`\`

### 3. 检查端口配置
\`\`\`bash
display current-configuration interface <端口>
\`\`\`

### 4. 检查端口协商
\`\`\`bash
display interface <端口> negotiation
\`\`\`

### 5. 强制端口模式
\`\`\`bash
interface <端口>
 speed 1000
 duplex full
\`\`\``,
      tags: ['端口', '网络', '连接'],
      createdBy: '系统',
      createdAt: new Date(now - 172800000).toISOString(),
      updatedAt: new Date(now - 172800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '4',
      title: '如何恢复丢失的设备密码',
      category: '常见问题',
      content: `## 密码恢复方法

### 华为设备密码恢复
1. 重启设备并进入BootROM
2. 选择跳过密码检查
3. 进入系统后修改密码

### Cisco设备密码恢复
1. 重启设备进入ROMMON模式
2. 修改配置寄存器
3. 进入系统后恢复密码

### 注意事项
- 密码恢复需要物理访问设备
- 建议定期备份配置
- 启用密码恢复保护功能`,
      tags: ['密码', '安全', '恢复'],
      createdBy: '系统',
      createdAt: new Date(now - 259200000).toISOString(),
      updatedAt: new Date(now - 259200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '5',
      title: 'SNMP无法监控设备怎么办',
      category: '常见问题',
      content: `## SNMP配置检查

### 1. 检查SNMP服务状态
\`\`\`bash
display snmp-agent
\`\`\`

### 2. 检查SNMP版本配置
\`\`\`bash
display snmp-agent sys-info version
\`\`\`

### 3. 检查社区字符串
\`\`\`bash
display snmp-agent community
\`\`\`

### 4. 测试SNMP连通性
\`\`\`bash
snmpwalk -v2c -c <community> <设备IP> .1.3.6.1.2.1.1.1.0
\`\`\`

### 5. 检查ACL限制
\`\`\`bash
display snmp-agent acl
\`\`\``,
      tags: ['SNMP', '监控', '配置'],
      createdBy: '系统',
      createdAt: new Date(now - 345600000).toISOString(),
      updatedAt: new Date(now - 345600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '6',
      title: 'VLAN配置不生效怎么办',
      category: '常见问题',
      content: `## VLAN配置排查

### 1. 检查VLAN配置
\`\`\`bash
display vlan <vlan-id>
\`\`\`

### 2. 检查端口VLAN配置
\`\`\`bash
display port vlan
\`\`\`

### 3. 检查Trunk端口配置
\`\`\`bash
display interface trunk
\`\`\`

### 4. 检查Access端口配置
\`\`\`bash
display interface access
\`\`\`

### 5. 验证VLAN通信
\`\`\`bash
ping -vlan <vlan-id> <目标IP>
\`\`\``,
      tags: ['VLAN', '配置', '网络'],
      createdBy: '系统',
      createdAt: new Date(now - 432000000).toISOString(),
      updatedAt: new Date(now - 432000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '7',
      title: '如何解决路由环路问题',
      category: '常见问题',
      content: `## 路由环路排查

### 1. 检测路由环路
\`\`\`bash
tracert <目标IP>
\`\`\`

### 2. 检查路由表
\`\`\`bash
display ip routing-table
\`\`\`

### 3. 检查OSPF状态
\`\`\`bash
display ospf peer
display ospf routing
\`\`\`

### 4. 检查BGP状态
\`\`\`bash
display bgp peer
display bgp routing-table
\`\`\`

### 5. 启用环路检测
\`\`\`bash
ip route-static check-loop
\`\`\``,
      tags: ['路由', '环路', 'OSPF'],
      createdBy: '系统',
      createdAt: new Date(now - 518400000).toISOString(),
      updatedAt: new Date(now - 518400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '8',
      title: '设备CPU使用率过高怎么办',
      category: '常见问题',
      content: `## CPU高使用率排查

### 1. 查看CPU使用率
\`\`\`bash
display cpu-usage
\`\`\`

### 2. 查看进程占用
\`\`\`bash
display process
\`\`\`

### 3. 检查日志处理
\`\`\`bash
display logbuffer
\`\`\`

### 4. 检查SNMP轮询频率
\`\`\`bash
display snmp-agent statistics
\`\`\`

### 5. 优化建议
- 调整日志级别
- 降低SNMP轮询频率
- 关闭不必要的服务`,
      tags: ['CPU', '性能', '优化'],
      createdBy: '系统',
      createdAt: new Date(now - 604800000).toISOString(),
      updatedAt: new Date(now - 604800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '9',
      title: '如何备份和恢复设备配置',
      category: '常见问题',
      content: `## 配置备份与恢复

### 1. 保存配置到设备
\`\`\`bash
save
\`\`\`

### 2. 导出配置到TFTP
\`\`\`bash
save tftp://<服务器IP>/config.cfg
\`\`\`

### 3. 导出配置到FTP
\`\`\`bash
save ftp://<用户名>:<密码>@<服务器IP>/config.cfg
\`\`\`

### 4. 恢复配置
\`\`\`bash
load tftp://<服务器IP>/config.cfg
\`\`\`

### 5. 配置自动备份
\`\`\`bash
schedule task backup
  time repeating at 02:00
  command save tftp://<服务器IP>/config_$date.cfg
\`\`\``,
      tags: ['备份', '配置', '恢复'],
      createdBy: '系统',
      createdAt: new Date(now - 691200000).toISOString(),
      updatedAt: new Date(now - 691200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '10',
      title: '如何配置NTP时间同步',
      category: '常见问题',
      content: `## NTP配置指南

### 1. 配置NTP服务器
\`\`\`bash
ntp-service unicast-server <NTP服务器IP>
\`\`\`

### 2. 配置NTP客户端
\`\`\`bash
ntp-service enable
ntp-service sync-interval 600
\`\`\`

### 3. 查看NTP状态
\`\`\`bash
display ntp-service status
display ntp-service session
\`\`\`

### 4. 配置本地时区
\`\`\`bash
clock timezone Beijing 8
\`\`\`

### 5. 验证时间同步
\`\`\`bash
display clock
\`\`\``,
      tags: ['NTP', '时间', '同步'],
      createdBy: '系统',
      createdAt: new Date(now - 777600000).toISOString(),
      updatedAt: new Date(now - 777600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    })

    // 命令参考 (15条)
    articles.push({
      id: '11',
      title: '华为交换机常用命令',
      category: '命令参考',
      content: `## 华为交换机命令速查

### 系统管理
- \`display version\` - 查看版本信息
- \`display device\` - 查看设备信息
- \`display current-configuration\` - 查看当前配置
- \`display saved-configuration\` - 查看保存配置
- \`save\` - 保存配置
- \`reboot\` - 重启设备

### 端口管理
- \`display interface brief\` - 查看端口状态
- \`display interface <端口>\` - 查看端口详情
- \`interface <端口>\` - 进入端口配置
- \`shutdown\` - 关闭端口
- \`undo shutdown\` - 开启端口

### VLAN管理
- \`display vlan\` - 查看VLAN配置
- \`vlan <vlan-id>\` - 创建/进入VLAN
- \`port access vlan <vlan-id>\` - 配置Access端口
- \`port trunk allow-pass vlan\` - 配置Trunk端口`,
      tags: ['华为', '交换机', '命令'],
      createdBy: '系统',
      createdAt: new Date(now - 864000000).toISOString(),
      updatedAt: new Date(now - 864000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '12',
      title: 'Cisco交换机常用命令',
      category: '命令参考',
      content: `## Cisco交换机命令速查

### 系统管理
- \`show version\` - 查看版本信息
- \`show running-config\` - 查看当前配置
- \`show startup-config\` - 查看启动配置
- \`write memory\` - 保存配置
- \`reload\` - 重启设备

### 端口管理
- \`show ip interface brief\` - 查看端口状态
- \`show interface <端口>\` - 查看端口详情
- \`interface <端口>\` - 进入端口配置
- \`shutdown\` - 关闭端口
- \`no shutdown\` - 开启端口

### VLAN管理
- \`show vlan brief\` - 查看VLAN配置
- \`vlan <vlan-id>\` - 创建VLAN
- \`switchport mode access\` - 配置Access模式
- \`switchport access vlan <vlan-id>\` - 配置Access端口
- \`switchport mode trunk\` - 配置Trunk模式`,
      tags: ['Cisco', '交换机', '命令'],
      createdBy: '系统',
      createdAt: new Date(now - 950400000).toISOString(),
      updatedAt: new Date(now - 950400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '13',
      title: '路由协议命令参考',
      category: '命令参考',
      content: `## 路由协议命令

### OSPF配置
- \`router ospf <进程号>\` - 启用OSPF
- \`network <网络> <反掩码> area <区域>\` - 宣告网络
- \`display ospf peer\` - 查看OSPF邻居
- \`display ospf routing\` - 查看OSPF路由
- \`display ospf interface\` - 查看OSPF接口

### BGP配置
- \`router bgp <AS号>\` - 启用BGP
- \`peer <邻居IP> as-number <AS号>\` - 配置邻居
- \`network <网络> <掩码>\` - 宣告网络
- \`display bgp peer\` - 查看BGP邻居
- \`display bgp routing-table\` - 查看BGP路由

### 静态路由
- \`ip route-static <目的网络> <掩码> <下一跳>\` - 配置静态路由
- \`display ip routing-table\` - 查看路由表`,
      tags: ['路由', 'OSPF', 'BGP'],
      createdBy: '系统',
      createdAt: new Date(now - 1036800000).toISOString(),
      updatedAt: new Date(now - 1036800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '14',
      title: '安全配置命令参考',
      category: '命令参考',
      content: `## 安全配置命令

### AAA配置
- \`aaa\` - 进入AAA配置
- \`local-user <用户名> password <密码>\` - 创建本地用户
- \`local-user <用户名> service-type ssh\` - 配置服务类型
- \`display local-user\` - 查看本地用户

### SSH配置
- \`ssh server enable\` - 启用SSH服务
- \`ssh authentication-type default password\` - 设置认证方式
- \`display ssh server status\` - 查看SSH状态

### ACL配置
- \`acl <编号>\` - 创建ACL
- \`rule permit/deny\` - 添加规则
- \`display acl\` - 查看ACL配置
- \`traffic-filter\` - 应用ACL`,
      tags: ['安全', 'AAA', 'SSH', 'ACL'],
      createdBy: '系统',
      createdAt: new Date(now - 1123200000).toISOString(),
      updatedAt: new Date(now - 1123200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '15',
      title: 'QoS配置命令参考',
      category: '命令参考',
      content: `## QoS配置命令

### 流量分类
- \`traffic classifier <名称>\` - 创建流量分类
- \`if-match\` - 匹配规则

### 流量行为
- \`traffic behavior <名称>\` - 创建流量行为
- \`remark dscp\` - 标记DSCP
- \`queue\` - 队列调度
- \`car\` - 流量限速

### 策略配置
- \`traffic policy <名称>\` - 创建流量策略
- \`classifier <分类> behavior <行为>\` - 绑定分类和行为
- \`traffic-policy <策略> inbound/outbound\` - 应用策略

### 队列管理
- \`display qos queue\` - 查看队列状态
- \`qos queue scheduling\` - 配置队列调度`,
      tags: ['QoS', '流量', '优先级'],
      createdBy: '系统',
      createdAt: new Date(now - 1209600000).toISOString(),
      updatedAt: new Date(now - 1209600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '16',
      title: '端口聚合命令参考',
      category: '命令参考',
      content: `## 端口聚合命令

### 创建Eth-Trunk
- \`interface Eth-Trunk <编号>\` - 创建聚合组
- \`mode lacp/static\` - 设置聚合模式
- \`interface <端口>\` - 进入端口
- \`eth-trunk <编号>\` - 将端口加入聚合组

### 查看聚合状态
- \`display eth-trunk\` - 查看聚合组状态
- \`display eth-trunk <编号>\` - 查看特定聚合组
- \`display lacp brief\` - 查看LACP状态

### LACP配置
- \`lacp priority <优先级>\` - 设置LACP优先级
- \`lacp preempt enable\` - 启用抢占
- \`max active-linknumber <数量>\` - 设置最大活动链路数`,
      tags: ['端口聚合', 'LACP', 'Eth-Trunk'],
      createdBy: '系统',
      createdAt: new Date(now - 1296000000).toISOString(),
      updatedAt: new Date(now - 1296000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '17',
      title: 'VRRP配置命令参考',
      category: '命令参考',
      content: `## VRRP配置命令

### 创建VRRP组
- \`interface Vlanif <vlan-id>\` - 进入VLAN接口
- \`vrrp vrid <编号> virtual-ip <IP地址>\` - 配置虚拟IP

### VRRP参数
- \`vrrp vrid <编号> priority <优先级>\` - 设置优先级
- \`vrrp vrid <编号> preempt-mode\` - 启用抢占
- \`vrrp vrid <编号> timer advertise <时间>\` - 设置通告时间

### 查看VRRP状态
- \`display vrrp\` - 查看VRRP状态
- \`display vrrp interface\` - 查看接口VRRP

### 跟踪接口
- \`vrrp vrid <编号> track interface <端口>\` - 跟踪端口状态`,
      tags: ['VRRP', '冗余', '高可用'],
      createdBy: '系统',
      createdAt: new Date(now - 1382400000).toISOString(),
      updatedAt: new Date(now - 1382400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '18',
      title: 'DHCP配置命令参考',
      category: '命令参考',
      content: `## DHCP配置命令

### DHCP服务器配置
- \`ip pool <池名>\` - 创建地址池
- \`network <网络> mask <掩码>\` - 配置地址范围
- \`gateway-list <网关>\` - 配置网关
- \`dns-list <DNS>\` - 配置DNS
- \`lease day <天数> hour <小时> minute <分钟>\` - 配置租期

### DHCP中继配置
- \`interface <接口>\` - 进入接口
- \`dhcp select relay\` - 启用DHCP中继
- \`dhcp relay server-ip <服务器IP>\` - 配置DHCP服务器

### DHCP客户端配置
- \`interface <接口>\` - 进入接口
- \`ip address dhcp-alloc\` - 启用DHCP客户端

### 查看DHCP状态
- \`display ip pool\` - 查看地址池
- \`display dhcp relay\` - 查看中继状态`,
      tags: ['DHCP', 'IP地址', '配置'],
      createdBy: '系统',
      createdAt: new Date(now - 1468800000).toISOString(),
      updatedAt: new Date(now - 1468800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '19',
      title: 'STP配置命令参考',
      category: '命令参考',
      content: `## STP配置命令

### 启用STP
- \`stp enable\` - 全局启用STP
- \`stp mode stp/rstp/mstp\` - 设置STP模式

### STP参数
- \`stp priority <优先级>\` - 设置交换机优先级
- \`stp interface <端口> cost <开销>\` - 设置端口开销
- \`stp interface <端口> priority <优先级>\` - 设置端口优先级

### MSTP配置
- \`stp region-configuration\` - 进入MST域配置
- \`region-name <名称>\` - 设置域名称
- \`instance <实例> vlan <vlan范围>\` - 映射VLAN到实例
- \`active region-configuration\` - 激活配置

### 查看STP状态
- \`display stp\` - 查看STP状态
- \`display stp brief\` - 查看STP摘要`,
      tags: ['STP', 'RSTP', 'MSTP', '环路'],
      createdBy: '系统',
      createdAt: new Date(now - 1555200000).toISOString(),
      updatedAt: new Date(now - 1555200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '20',
      title: '端口镜像命令参考',
      category: '命令参考',
      content: `## 端口镜像命令

### 本地镜像
- \`observe-port <端口>\` - 配置观察端口
- \`interface <端口>\` - 进入源端口
- \`mirror-to observe-port <端口>\` - 配置镜像

### 远程镜像
- \`mirror-group <编号> remote-source\` - 创建远程镜像组
- \`mirror-group <编号> mirroring-port <端口> both\` - 添加源端口
- \`mirror-group <编号> reflector-port <端口>\` - 添加反射端口
- \`mirror-group <编号> remote-probe vlan <vlan>\` - 配置探测VLAN

### ERSPAN配置
- \`erspan session <编号>\` - 创建ERSPAN会话
- \`source interface <端口>\` - 配置源接口
- \`destination ip <IP地址>\` - 配置目的IP

### 查看镜像状态
- \`display mirror-group\` - 查看镜像组
- \`display observe-port\` - 查看观察端口`,
      tags: ['端口镜像', 'ERSPAN', '监控'],
      createdBy: '系统',
      createdAt: new Date(now - 1641600000).toISOString(),
      updatedAt: new Date(now - 1641600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '21',
      title: 'IPv6配置命令参考',
      category: '命令参考',
      content: `## IPv6配置命令

### 启用IPv6
- \`ipv6\` - 全局启用IPv6
- \`interface <接口>\` - 进入接口
- \`ipv6 enable\` - 接口启用IPv6

### 配置IPv6地址
- \`ipv6 address <地址>/<前缀长度>\` - 配置静态地址
- \`ipv6 address auto\` - 自动获取地址
- \`ipv6 address dhcp\` - DHCPv6获取地址

### IPv6路由
- \`ipv6 route-static <前缀>/<长度> <下一跳>\` - 静态路由
- \`ospfv3 <进程号>\` - 启用OSPFv3
- \`display ipv6 routing-table\` - 查看IPv6路由表

### IPv6邻居
- \`display ipv6 neighbors\` - 查看IPv6邻居
- \`display ipv6 interface\` - 查看IPv6接口`,
      tags: ['IPv6', '配置', '路由'],
      createdBy: '系统',
      createdAt: new Date(now - 1728000000).toISOString(),
      updatedAt: new Date(now - 1728000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '22',
      title: 'MPLS配置命令参考',
      category: '命令参考',
      content: `## MPLS配置命令

### 启用MPLS
- \`mpls lsr-id <LSR-ID>\` - 配置LSR ID
- \`mpls\` - 全局启用MPLS

### MPLS LDP配置
- \`mpls ldp\` - 启用LDP
- \`interface <接口>\` - 进入接口
- \`mpls ldp enable\` - 接口启用LDP
- \`display mpls ldp session\` - 查看LDP会话

### MPLS VPN配置
- \`ip vpn-instance <名称>\` - 创建VPN实例
- \`ipv4-family\` - 进入IPv4地址族
- \`route-distinguisher <RD>\` - 配置RD
- \`vpn-target <RT> export/import\` - 配置RT

### 查看MPLS状态
- \`display mpls lsp\` - 查看LSP
- \`display mpls forwarding-table\` - 查看转发表`,
      tags: ['MPLS', 'VPN', 'LDP'],
      createdBy: '系统',
      createdAt: new Date(now - 1814400000).toISOString(),
      updatedAt: new Date(now - 1814400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '23',
      title: 'NAT配置命令参考',
      category: '命令参考',
      content: `## NAT配置命令

### 静态NAT
- \`nat static global <公网IP> inside <内网IP>\` - 静态映射

### 动态NAT
- \`nat address-group <组名> <起始IP> <结束IP>\` - 创建地址池
- \`acl <编号>\` - 创建ACL
- \`nat outbound <ACL> address-group <组名>\` - 配置出向NAT

### PAT配置
- \`nat outbound <ACL> interface <接口> overload\` - 端口地址转换

### NAT Server
- \`nat server protocol tcp global <公网IP> <端口> inside <内网IP> <端口>\` - 配置端口映射

### 查看NAT状态
- \`display nat\` - 查看NAT配置
- \`display nat session\` - 查看NAT会话`,
      tags: ['NAT', '防火墙', '网络地址转换'],
      createdBy: '系统',
      createdAt: new Date(now - 1900800000).toISOString(),
      updatedAt: new Date(now - 1900800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '24',
      title: 'BFD配置命令参考',
      category: '命令参考',
      content: `## BFD配置命令

### 启用BFD
- \`bfd\` - 全局启用BFD

### 配置BFD会话
- \`bfd <会话名> bind peer-ip <邻居IP>\` - 创建BFD会话
- \`discriminator local <本地标识>\` - 配置本地标识
- \`discriminator remote <远端标识>\` - 配置远端标识
- \`min-transmit-interval <时间>\` - 配置最小发送间隔
- \`min-receive-interval <时间>\` - 配置最小接收间隔
- \`detect-multiplier <倍数>\` - 配置检测倍数

### 与路由联动
- \`ospf bfd enable\` - OSPF启用BFD
- \`bgp bfd enable\` - BGP启用BFD
- \`ip route-static <网络> <掩码> <下一跳> bfd\` - 静态路由启用BFD

### 查看BFD状态
- \`display bfd session\` - 查看BFD会话`,
      tags: ['BFD', '快速检测', '故障检测'],
      createdBy: '系统',
      createdAt: new Date(now - 1987200000).toISOString(),
      updatedAt: new Date(now - 1987200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '25',
      title: 'NetFlow配置命令参考',
      category: '命令参考',
      content: `## NetFlow配置命令

### 配置NetFlow
- \`ip netflow\` - 全局启用NetFlow
- \`interface <接口>\` - 进入接口
- \`ip netflow inbound\` - 入方向启用NetFlow
- \`ip netflow outbound\` - 出方向启用NetFlow

### 配置NetFlow收集器
- \`ip netflow exporter <名称>\` - 创建导出器
- \`destination <收集器IP> <端口>\` - 配置收集器地址
- \`source <源接口>\` - 配置源接口
- \`version <版本>\` - 配置NetFlow版本

### 配置采样
- \`ip netflow sampler <名称>\` - 创建采样器
- \`mode random <采样率>\` - 配置采样模式

### 查看NetFlow状态
- \`display ip netflow\` - 查看NetFlow状态
- \`display ip netflow statistics\` - 查看统计信息`,
      tags: ['NetFlow', '流量分析', '监控'],
      createdBy: '系统',
      createdAt: new Date(now - 2073600000).toISOString(),
      updatedAt: new Date(now - 2073600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    })

    // 最佳实践 (10条)
    articles.push({
      id: '26',
      title: '网络设备安全加固最佳实践',
      category: '最佳实践',
      content: `## 设备安全加固指南

### 1. 账号安全
- 禁用默认账号
- 设置强密码策略
- 定期更换密码
- 启用账号锁定

### 2. 访问控制
- 配置SSH白名单
- 禁用Telnet
- 配置管理VLAN
- 启用端口安全

### 3. 日志审计
- 启用日志记录
- 配置日志服务器
- 定期审计日志
- 启用操作日志

### 4. 服务管理
- 禁用不必要服务
- 限制SNMP访问
- 配置NTP同步
- 启用时间戳

### 5. 配置备份
- 定期备份配置
- 加密备份文件
- 异地存储备份
- 自动化备份`,
      tags: ['安全', '加固', '最佳实践'],
      createdBy: '系统',
      createdAt: new Date(now - 2160000000).toISOString(),
      updatedAt: new Date(now - 2160000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '27',
      title: '网络规划设计最佳实践',
      category: '最佳实践',
      content: `## 网络规划指南

### 1. VLAN规划
- 按功能划分VLAN
- 合理规划VLAN ID范围
- 配置VLAN描述
- 禁用未使用VLAN

### 2. IP地址规划
- 合理划分子网
- 预留扩展空间
- 规划管理IP段
- 配置地址池

### 3. 路由规划
- 设计合理的路由层次
- 使用路由汇总
- 配置路由过滤
- 启用路由冗余

### 4. 高可用设计
- 部署冗余设备
- 配置VRRP/HSRP
- 启用链路聚合
- 设计故障切换

### 5. 监控规划
- 部署SNMP监控
- 配置Syslog服务器
- 部署流量分析
- 设置告警阈值`,
      tags: ['网络规划', '设计', '架构'],
      createdBy: '系统',
      createdAt: new Date(now - 2246400000).toISOString(),
      updatedAt: new Date(now - 2246400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '28',
      title: '数据中心网络最佳实践',
      category: '最佳实践',
      content: `## 数据中心网络设计

### 1. 网络架构
- 使用Spine-Leaf架构
- 设计三层网络
- 配置ECMP
- 启用BGP路由

### 2. 链路设计
- 使用10G/40G/100G链路
- 部署冗余链路
- 配置端口聚合
- 启用LACP

### 3. 虚拟化支持
- 配置VXLAN
- 部署EVPN
- 支持VM迁移
- 配置分布式路由

### 4. 安全设计
- 部署防火墙集群
- 配置微分段
- 启用流量监控
- 部署入侵检测

### 5. 运维管理
- 配置带外管理
- 部署自动化工具
- 配置网络监控
- 制定运维流程`,
      tags: ['数据中心', 'Spine-Leaf', 'VXLAN'],
      createdBy: '系统',
      createdAt: new Date(now - 2332800000).toISOString(),
      updatedAt: new Date(now - 2332800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '29',
      title: '无线网络部署最佳实践',
      category: '最佳实践',
      content: `## WiFi部署指南

### 1. 站点勘测
- 使用专业工具勘测
- 测量信号强度
- 检测信道干扰
- 规划AP位置

### 2. 信道规划
- 2.4GHz使用1,6,11信道
- 5GHz使用非重叠信道
- 配置自动信道选择
- 启用雷达检测

### 3. 功率配置
- 设置合理发射功率
- 启用功率控制
- 配置漫游阈值
- 设置负载均衡

### 4. 安全配置
- 使用WPA2/WPA3加密
- 配置802.1X认证
- 启用访客网络
- 配置MAC过滤

### 5. 监控优化
- 部署WiFi监控
- 分析连接质量
- 优化漫游体验
- 定期性能测试`,
      tags: ['WiFi', '无线网络', '部署'],
      createdBy: '系统',
      createdAt: new Date(now - 2419200000).toISOString(),
      updatedAt: new Date(now - 2419200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '30',
      title: '网络变更管理最佳实践',
      category: '最佳实践',
      content: `## 变更管理流程

### 1. 变更申请
- 提交变更工单
- 描述变更内容
- 评估风险等级
- 指定变更窗口

### 2. 变更评估
- 审核变更影响
- 制定回滚计划
- 安排测试环境
- 确认变更时间

### 3. 变更执行
- 备份当前配置
- 执行变更操作
- 验证变更效果
- 记录变更日志

### 4. 变更验证
- 测试业务功能
- 检查网络连通性
- 验证性能指标
- 确认无异常告警

### 5. 变更闭环
- 更新文档记录
- 总结变更经验
- 归档变更资料
- 关闭变更工单`,
      tags: ['变更管理', '运维流程', '风险控制'],
      createdBy: '系统',
      createdAt: new Date(now - 2505600000).toISOString(),
      updatedAt: new Date(now - 2505600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '31',
      title: '网络监控最佳实践',
      category: '最佳实践',
      content: `## 监控体系建设

### 1. 监控指标
- 设备可用性监控
- 端口状态监控
- 流量性能监控
- 资源利用率监控

### 2. 告警配置
- 设置合理阈值
- 配置告警级别
- 设置告警抑制
- 配置告警通知

### 3. 日志管理
- 集中日志收集
- 日志分析检索
- 日志归档存储
- 日志安全审计

### 4. 可视化展示
- 仪表盘展示
- 趋势分析图表
- 拓扑可视化
- 实时状态展示

### 5. 自动化响应
- 自动故障检测
- 自动告警升级
- 自动配置备份
- 自动健康检查`,
      tags: ['监控', '告警', '可视化'],
      createdBy: '系统',
      createdAt: new Date(now - 2592000000).toISOString(),
      updatedAt: new Date(now - 2592000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '32',
      title: 'IPv6迁移最佳实践',
      category: '最佳实践',
      content: `## IPv6迁移策略

### 1. 规划阶段
- 评估现有网络
- 制定迁移计划
- 培训技术人员
- 准备测试环境

### 2. 双栈部署
- 启用IPv6支持
- 配置双栈接口
- 部署IPv6路由
- 配置DNS双栈

### 3. 逐步迁移
- 先迁移非关键业务
- 配置IPv6-only网络
- 部署NAT64
- 配置DNS64

### 4. 测试验证
- 测试连通性
- 验证性能
- 检查兼容性
- 测试安全策略

### 5. 运维支持
- 监控IPv6网络
- 培训运维人员
- 更新文档资料
- 持续优化`,
      tags: ['IPv6', '迁移', '双栈'],
      createdBy: '系统',
      createdAt: new Date(now - 2678400000).toISOString(),
      updatedAt: new Date(now - 2678400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '33',
      title: 'SD-WAN部署最佳实践',
      category: '最佳实践',
      content: `## SD-WAN部署指南

### 1. 需求分析
- 评估广域网需求
- 分析流量模式
- 确定SLA要求
- 评估成本效益

### 2. 架构设计
- 选择SD-WAN方案
- 设计网络拓扑
- 配置站点连接
- 规划冗余设计

### 3. 部署实施
- 配置边缘设备
- 部署控制器
- 配置策略规则
- 测试连接质量

### 4. 优化调整
- 配置流量策略
- 优化路径选择
- 调整QoS配置
- 配置安全策略

### 5. 运维管理
- 监控链路状态
- 分析流量模式
- 优化成本支出
- 定期审计配置`,
      tags: ['SD-WAN', '广域网', '优化'],
      createdBy: '系统',
      createdAt: new Date(now - 2764800000).toISOString(),
      updatedAt: new Date(now - 2764800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '34',
      title: '网络自动化最佳实践',
      category: '最佳实践',
      content: `## 网络自动化指南

### 1. 自动化目标
- 减少重复性工作
- 提高配置准确性
- 加快部署速度
- 降低人为错误

### 2. 工具选择
- 选择配置管理工具
- 使用网络API
- 部署自动化平台
- 选择编程语言

### 3. 自动化场景
- 配置备份自动化
- 设备巡检自动化
- 配置部署自动化
- 故障恢复自动化

### 4. 实施策略
- 从简单场景开始
- 建立测试环境
- 版本控制配置
- 实施变更审批

### 5. 持续改进
- 监控自动化运行
- 收集反馈意见
- 扩展自动化范围
- 持续优化脚本`,
      tags: ['自动化', 'DevOps', '网络'],
      createdBy: '系统',
      createdAt: new Date(now - 2851200000).toISOString(),
      updatedAt: new Date(now - 2851200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '35',
      title: '网络文档管理最佳实践',
      category: '最佳实践',
      content: `## 文档管理指南

### 1. 文档类型
- 网络拓扑图
- 设备配置文档
- IP地址规划表
- VLAN配置文档

### 2. 文档规范
- 统一文档格式
- 使用版本控制
- 定期更新维护
- 建立文档模板

### 3. 文档存储
- 集中存储管理
- 配置访问权限
- 备份文档资料
- 支持全文检索

### 4. 文档更新
- 变更后及时更新
- 记录变更历史
- 通知相关人员
- 审核文档内容

### 5. 文档使用
- 培训团队成员
- 建立查询流程
- 定期文档审计
- 持续改进文档质量`,
      tags: ['文档', '管理', '标准化'],
      createdBy: '系统',
      createdAt: new Date(now - 2937600000).toISOString(),
      updatedAt: new Date(now - 2937600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    })

    // 配置模板 (10条)
    articles.push({
      id: '36',
      title: '交换机基础配置模板',
      category: '配置模板',
      content: `## 交换机基础配置

\`\`\`bash
system-view

# 配置主机名
sysname SW-核心-01

# 配置管理IP
interface Vlanif1
 ip address 192.168.1.1 255.255.255.0

# 配置默认网关
ip route-static 0.0.0.0 0.0.0.0 192.168.1.254

# 配置DNS
dns resolve
dns server 8.8.8.8
dns server 114.114.114.114

# 配置NTP
ntp-service unicast-server 192.168.1.100
clock timezone Beijing 8

# 配置SSH
ssh server enable
ssh authentication-type default password

# 配置安全
aaa
 local-user admin password cipher Admin@123
 local-user admin service-type ssh
 local-user admin privilege level 15

# 配置日志
info-center enable
info-center loghost 192.168.1.101

# 保存配置
save
\`\`\``,
      tags: ['交换机', '配置模板', '基础配置'],
      createdBy: '系统',
      createdAt: new Date(now - 3024000000).toISOString(),
      updatedAt: new Date(now - 3024000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '37',
      title: '路由器基础配置模板',
      category: '配置模板',
      content: `## 路由器基础配置

\`\`\`bash
system-view

# 配置主机名
sysname RT-出口-01

# 配置接口IP
interface GigabitEthernet 0/0/0
 ip address 202.100.1.1 255.255.255.252

interface GigabitEthernet 0/0/1
 ip address 192.168.1.254 255.255.255.0

# 配置静态路由
ip route-static 0.0.0.0 0.0.0.0 202.100.1.2

# 配置NAT
acl 2000
 rule permit source 192.168.1.0 0.0.0.255

nat address-group 1 202.100.1.10 202.100.1.20

interface GigabitEthernet 0/0/0
 nat outbound 2000 address-group 1

# 配置防火墙
firewall zone trust
 add interface GigabitEthernet 0/0/1

firewall zone untrust
 add interface GigabitEthernet 0/0/0

# 配置服务
ssh server enable
ntp-service unicast-server 192.168.1.100

# 保存配置
save
\`\`\``,
      tags: ['路由器', '配置模板', 'NAT'],
      createdBy: '系统',
      createdAt: new Date(now - 3110400000).toISOString(),
      updatedAt: new Date(now - 3110400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '38',
      title: 'OSPF区域配置模板',
      category: '配置模板',
      content: `## OSPF区域配置

\`\`\`bash
system-view

# 核心路由器配置
sysname RT-核心-01

ospf 1 router-id 1.1.1.1
 area 0
  network 10.0.0.0 0.255.255.255
  network 192.168.1.0 0.0.0.255

# 接入路由器配置
sysname RT-接入-01

ospf 1 router-id 2.2.2.2
 area 0
  network 10.0.1.0 0.0.0.255
 area 1
  network 192.168.10.0 0.0.0.255

# 配置OSPF参数
ospf 1
 silent-interface GigabitEthernet 0/0/2
 preference 10
\`\`\``,
      tags: ['OSPF', '路由', '配置模板'],
      createdBy: '系统',
      createdAt: new Date(now - 3196800000).toISOString(),
      updatedAt: new Date(now - 3196800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '39',
      title: 'VLAN配置模板',
      category: '配置模板',
      content: `## VLAN配置

\`\`\`bash
system-view

# 创建VLAN
vlan batch 10 20 30 40 100

# 配置VLAN描述
vlan 10
 description 业务VLAN
vlan 20
 description 办公VLAN
vlan 30
 description 服务器VLAN
vlan 40
 description 监控VLAN
vlan 100
 description 管理VLAN

# 配置Access端口
interface GigabitEthernet 0/0/1
 port link-type access
 port default vlan 10

interface GigabitEthernet 0/0/2
 port link-type access
 port default vlan 20

# 配置Trunk端口
interface GigabitEthernet 0/0/24
 port link-type trunk
 port trunk allow-pass vlan all
 port trunk pvid vlan 100

# 配置管理VLAN接口
interface Vlanif100
 ip address 192.168.100.1 255.255.255.0
\`\`\``,
      tags: ['VLAN', '端口配置', '配置模板'],
      createdBy: '系统',
      createdAt: new Date(now - 3283200000).toISOString(),
      updatedAt: new Date(now - 3283200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '40',
      title: 'DHCP服务器配置模板',
      category: '配置模板',
      content: `## DHCP服务器配置

\`\`\`bash
system-view

# 配置全局地址池
ip pool 业务池
 gateway-list 192.168.10.1
 network 192.168.10.0 mask 255.255.255.0
 dns-list 8.8.8.8 114.114.114.114
 lease day 7

# 配置排除地址
excluded-ip-address 192.168.10.1 192.168.10.10

# 接口启用DHCP
interface Vlanif10
 ip address 192.168.10.1 255.255.255.0
 dhcp select global

# DHCP中继配置
interface Vlanif20
 ip address 192.168.20.1 255.255.255.0
 dhcp select relay
 dhcp relay server-ip 192.168.10.1
\`\`\``,
      tags: ['DHCP', 'IP地址', '配置模板'],
      createdBy: '系统',
      createdAt: new Date(now - 3369600000).toISOString(),
      updatedAt: new Date(now - 3369600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '41',
      title: '端口聚合配置模板',
      category: '配置模板',
      content: `## 端口聚合配置

\`\`\`bash
system-view

# 配置Eth-Trunk（静态模式）
interface Eth-Trunk 1
 mode static
 description 连接核心交换机

# 将端口加入聚合组
interface GigabitEthernet 0/0/1
 eth-trunk 1

interface GigabitEthernet 0/0/2
 eth-trunk 1

# 配置Eth-Trunk（LACP模式）
interface Eth-Trunk 2
 mode lacp
 lacp priority 100
 max active-linknumber 2

interface GigabitEthernet 0/0/3
 eth-trunk 2

interface GigabitEthernet 0/0/4
 eth-trunk 2

# 配置Trunk
interface Eth-Trunk 1
 port link-type trunk
 port trunk allow-pass vlan all
\`\`\``,
      tags: ['端口聚合', 'LACP', 'Eth-Trunk'],
      createdBy: '系统',
      createdAt: new Date(now - 3456000000).toISOString(),
      updatedAt: new Date(now - 3456000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '42',
      title: 'VRRP配置模板',
      category: '配置模板',
      content: `## VRRP配置

\`\`\`bash
system-view

# 主设备配置
sysname SW-主设备

interface Vlanif10
 ip address 192.168.10.2 255.255.255.0
 vrrp vrid 10 virtual-ip 192.168.10.1
 vrrp vrid 10 priority 120
 vrrp vrid 10 preempt-mode timer delay 5

# 备设备配置
sysname SW-备设备

interface Vlanif10
 ip address 192.168.10.3 255.255.255.0
 vrrp vrid 10 virtual-ip 192.168.10.1
 vrrp vrid 10 priority 100
 vrrp vrid 10 preempt-mode timer delay 10

# 配置接口跟踪
interface Vlanif10
 vrrp vrid 10 track interface GigabitEthernet 0/0/1 reduced 30
\`\`\``,
      tags: ['VRRP', '高可用', '配置模板'],
      createdBy: '系统',
      createdAt: new Date(now - 3542400000).toISOString(),
      updatedAt: new Date(now - 3542400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '43',
      title: 'STP配置模板',
      category: '配置模板',
      content: `## STP配置

\`\`\`bash
system-view

# 全局启用STP
stp enable
stp mode rstp

# 配置根桥
stp priority 4096

# 配置端口优先级
interface GigabitEthernet 0/0/1
 stp cost 100
 stp priority 0

# MSTP配置
stp region-configuration
 region-name DC-Region
 instance 1 vlan 10 20
 instance 2 vlan 30 40
 active region-configuration

# 禁用边缘端口STP
interface GigabitEthernet 0/0/10
 stp edged-port enable

# 配置BPDU保护
stp bpdu-protection enable
\`\`\``,
      tags: ['STP', 'RSTP', 'MSTP', '环路'],
      createdBy: '系统',
      createdAt: new Date(now - 3628800000).toISOString(),
      updatedAt: new Date(now - 3628800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '44',
      title: 'QoS配置模板',
      category: '配置模板',
      content: `## QoS配置

\`\`\`bash
system-view

# 创建流量分类
traffic classifier 语音业务
 if-match dscp ef

traffic classifier 视频业务
 if-match dscp af41

traffic classifier 数据业务
 if-match dscp af11

# 创建流量行为
traffic behavior 语音业务
 remark dscp ef
 queue af 5

traffic behavior 视频业务
 remark dscp af41
 queue af 4

traffic behavior 数据业务
 remark dscp af11
 queue af 2

# 创建流量策略
traffic policy QoS策略
 classifier 语音业务 behavior 语音业务
 classifier 视频业务 behavior 视频业务
 classifier 数据业务 behavior 数据业务

# 应用策略
interface GigabitEthernet 0/0/1
 traffic-policy QoS策略 inbound
 traffic-policy QoS策略 outbound

# 配置队列调度
qos queue scheduling wrr
 qos queue 0 weight 1
 qos queue 1 weight 2
 qos queue 2 weight 4
 qos queue 3 weight 8
 qos queue 4 weight 16
 qos queue 5 weight 32
\`\`\``,
      tags: ['QoS', '流量控制', '配置模板'],
      createdBy: '系统',
      createdAt: new Date(now - 3715200000).toISOString(),
      updatedAt: new Date(now - 3715200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '45',
      title: '端口镜像配置模板',
      category: '配置模板',
      content: `## 端口镜像配置

\`\`\`bash
system-view

# 本地镜像配置
observe-port 1 interface GigabitEthernet 0/0/24

interface GigabitEthernet 0/0/1
 mirror-to observe-port 1

# 远程镜像配置
mirror-group 1 remote-source
 mirroring-port GigabitEthernet 0/0/1 to 0/0/10 both
 reflector-port GigabitEthernet 0/0/20
 remote-probe vlan 100

# ERSPAN配置
erspan session 1
 source interface GigabitEthernet 0/0/1 both
 destination ip 192.168.100.100
 source ip 192.168.100.1

# 查看镜像状态
display mirror-group
display observe-port
\`\`\``,
      tags: ['端口镜像', 'ERSPAN', '监控'],
      createdBy: '系统',
      createdAt: new Date(now - 3801600000).toISOString(),
      updatedAt: new Date(now - 3801600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    })

    // 故障排查 (10条)
    articles.push({
      id: '46',
      title: '网络不通故障排查流程',
      category: '故障排查',
      content: `## 网络不通排查流程

### 步骤1: 确认故障范围
- 单个设备还是多个设备
- 特定VLAN还是全部网络
- 特定应用还是全部应用

### 步骤2: 基础连通性测试
\`\`\`bash
ping <网关IP>
ping <目标IP>
traceroute <目标IP>
\`\`\`

### 步骤3: 检查设备状态
\`\`\`bash
display interface brief
display ip routing-table
display vlan brief
\`\`\`

### 步骤4: 检查端口状态
\`\`\`bash
display interface <端口>
display port vlan
display interface trunk
\`\`\`

### 步骤5: 检查路由配置
\`\`\`bash
display ip routing-table
display ospf peer
display bgp peer
\`\`\`

### 步骤6: 检查安全策略
\`\`\`bash
display acl
display firewall policy
\`\`\``,
      tags: ['故障排查', '网络不通', '流程'],
      createdBy: '系统',
      createdAt: new Date(now - 3888000000).toISOString(),
      updatedAt: new Date(now - 3888000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '47',
      title: '链路故障排查指南',
      category: '故障排查',
      content: `## 链路故障排查

### 1. 物理层检查
- 检查网线连接
- 检查端口状态
- 检查光纤连接
- 检查光功率

### 2. 链路状态检查
\`\`\`bash
display interface brief
display interface <端口>
display eth-trunk
\`\`\`

### 3. 端口协商检查
\`\`\`bash
display interface <端口> negotiation
interface <端口>
 speed 1000
 duplex full
\`\`\`

### 4. 链路聚合检查
\`\`\`bash
display eth-trunk
display lacp brief
\`\`\`

### 5. 冗余链路检查
\`\`\`bash
display vrrp
display stp
\`\`\``,
      tags: ['链路故障', '端口', '聚合'],
      createdBy: '系统',
      createdAt: new Date(now - 3974400000).toISOString(),
      updatedAt: new Date(now - 3974400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '48',
      title: '路由故障排查指南',
      category: '故障排查',
      content: `## 路由故障排查

### 1. 路由表检查
\`\`\`bash
display ip routing-table
display ip routing-table <目标网络>
\`\`\`

### 2. OSPF故障排查
\`\`\`bash
display ospf peer
display ospf interface
display ospf routing
\`\`\`

### 3. BGP故障排查
\`\`\`bash
display bgp peer
display bgp routing-table
display bgp error
\`\`\`

### 4. 静态路由检查
\`\`\`bash
display ip route-static
\`\`\`

### 5. 路由策略检查
\`\`\`bash
display ip policy
display route-policy
\`\`\``,
      tags: ['路由故障', 'OSPF', 'BGP'],
      createdBy: '系统',
      createdAt: new Date(now - 4060800000).toISOString(),
      updatedAt: new Date(now - 4060800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '49',
      title: 'VPN故障排查指南',
      category: '故障排查',
      content: `## VPN故障排查

### 1. IPsec VPN排查
\`\`\`bash
display ipsec sa
display ike sa
display ipsec policy
\`\`\`

### 2. SSL VPN排查
\`\`\`bash
display sslvpn session
display sslvpn policy
display sslvpn statistics
\`\`\`

### 3. L2TP VPN排查
\`\`\`bash
display l2tp session
display l2tp tunnel
display ip pool
\`\`\`

### 4. 常见故障点
- 检查防火墙策略
- 检查NAT配置
- 检查加密算法配置
- 检查证书有效性`,
      tags: ['VPN', 'IPsec', 'SSL'],
      createdBy: '系统',
      createdAt: new Date(now - 4147200000).toISOString(),
      updatedAt: new Date(now - 4147200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '50',
      title: '高可用性故障排查',
      category: '故障排查',
      content: `## 高可用故障排查

### 1. VRRP故障排查
\`\`\`bash
display vrrp
display vrrp interface
display vrrp statistics
\`\`\`

### 2. HSRP故障排查
\`\`\`bash
show standby
show standby brief
show standby neighbors
\`\`\`

### 3. 端口聚合故障排查
\`\`\`bash
display eth-trunk
display lacp brief
display lacp statistics
\`\`\`

### 4. 故障切换测试
- 手动模拟故障
- 验证切换时间
- 检查业务恢复`,
      tags: ['高可用', 'VRRP', 'HSRP'],
      createdBy: '系统',
      createdAt: new Date(now - 4233600000).toISOString(),
      updatedAt: new Date(now - 4233600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    })

    // 通知推送 (10条)
    articles.push({
      id: '51',
      title: '邮件通知配置指南',
      category: '通知推送',
      content: `## 邮件通知配置

### 1. SMTP服务器配置
\`\`\`bash
# 配置SMTP服务器
email-server smtp.example.com 25
email-server username admin@example.com
email-server password cipher password123
email-server ssl enable
\`\`\`

### 2. 通知策略配置
\`\`\`bash
# 配置告警邮件通知
notification-policy alert-level critical
notification-policy email-to admin@example.com
notification-policy email-subject "【紧急】网络告警"
\`\`\`

### 3. 邮件模板配置
\`\`\`bash
# 自定义邮件模板
email-template alert
email-template subject "告警通知 - {alert_time}"
email-template body "告警级别: {level}\n告警内容: {message}"
\`\`\`

### 4. 测试邮件发送
\`\`\`bash
test email-server
\`\`\``,
      tags: ['邮件通知', 'SMTP', '告警'],
      createdBy: '系统',
      createdAt: new Date(now - 4320000000).toISOString(),
      updatedAt: new Date(now - 4320000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '52',
      title: '企业微信Webhook配置',
      category: '通知推送',
      content: `## 企业微信Webhook配置

### 1. 创建企业微信机器人
1. 进入企业微信后台
2. 创建自定义机器人
3. 获取Webhook地址

### 2. 配置Webhook
\`\`\`bash
# 配置企业微信Webhook
webhook wechat url "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"
webhook wechat enable
\`\`\`

### 3. 配置消息模板
\`\`\`bash
# 配置文本消息
webhook wechat template text
webhook wechat content "【网络告警】{level}: {message}"

# 配置Markdown消息
webhook wechat template markdown
webhook wechat content "## 网络告警\n**级别**: {level}\n**内容**: {message}"
\`\`\`

### 4. 测试Webhook
\`\`\`bash
test webhook wechat
\`\`\``,
      tags: ['企业微信', 'Webhook', '通知'],
      createdBy: '系统',
      createdAt: new Date(now - 4406400000).toISOString(),
      updatedAt: new Date(now - 4406400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '53',
      title: '钉钉Webhook配置',
      category: '通知推送',
      content: `## 钉钉Webhook配置

### 1. 创建钉钉机器人
1. 进入钉钉群设置
2. 添加群机器人
3. 获取Webhook地址

### 2. 配置Webhook
\`\`\`bash
# 配置钉钉Webhook
webhook dingtalk url "https://oapi.dingtalk.com/robot/send?access_token=xxx"
webhook dingtalk enable
\`\`\`

### 3. 配置安全设置
- 关键词校验
- IP白名单
- 签名校验

### 4. 配置消息模板
\`\`\`bash
# 配置文本消息
webhook dingtalk template text
webhook dingtalk content "【网络告警】{level}: {message}"

# 配置链接消息
webhook dingtalk template link
webhook dingtalk title "网络告警通知"
webhook dingtalk text "{message}"
webhook dingtalk messageUrl "http://monitor.example.com/alerts"
\`\`\``,
      tags: ['钉钉', 'Webhook', '通知'],
      createdBy: '系统',
      createdAt: new Date(now - 4492800000).toISOString(),
      updatedAt: new Date(now - 4492800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '54',
      title: '告警升级机制配置',
      category: '通知推送',
      content: `## 告警升级机制

### 1. 告警级别定义
\`\`\`bash
# 定义告警级别
alert-level critical severity 1
alert-level major severity 2
alert-level minor severity 3
alert-level warning severity 4
\`\`\`

### 2. 升级规则配置
\`\`\`bash
# 配置升级规则
alert-escalation rule 1
alert-escalation level critical
alert-escalation delay 5m
alert-escalation notify admin@example.com

alert-escalation rule 2
alert-escalation level major
alert-escalation delay 15m
alert-escalation notify team@example.com

alert-escalation rule 3
alert-escalation level minor
alert-escalation delay 30m
alert-escalation notify oncall@example.com
\`\`\`

### 3. 值班表配置
\`\`\`bash
# 配置值班人员
oncall-schedule monday 09:00-18:00 user1
oncall-schedule monday 18:00-09:00 user2
oncall-schedule tuesday 09:00-18:00 user3
\`\`\`

### 4. 通知抑制配置
\`\`\`bash
# 配置通知抑制
alert-suppression same-message 5m
alert-suppression same-source 10m
\`\`\``,
      tags: ['告警升级', '值班', '通知策略'],
      createdBy: '系统',
      createdAt: new Date(now - 4579200000).toISOString(),
      updatedAt: new Date(now - 4579200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '55',
      title: '短信通知配置',
      category: '通知推送',
      content: `## 短信通知配置

### 1. 短信网关配置
\`\`\`bash
# 配置短信网关
sms-gateway provider aliyun
sms-gateway access-key xxx
sms-gateway secret-key xxx
sms-gateway region cn-hangzhou
\`\`\`

### 2. 短信模板配置
\`\`\`bash
# 配置短信模板
sms-template alert
sms-template template-id SMS_123456789
sms-template content "【网络告警】{level}: {message}"
\`\`\`

### 3. 接收人配置
\`\`\`bash
# 配置紧急联系人
sms-recipient emergency 13800138000
sms-recipient oncall 13900139000
\`\`\`

### 4. 测试短信发送
\`\`\`bash
test sms-gateway 13800138000 "测试短信"
\`\`\``,
      tags: ['短信通知', '网关', '告警'],
      createdBy: '系统',
      createdAt: new Date(now - 4665600000).toISOString(),
      updatedAt: new Date(now - 4665600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '56',
      title: '通知日志管理',
      category: '通知推送',
      content: `## 通知日志管理

### 1. 查看通知日志
\`\`\`bash
display notification log
display notification log type email
display notification log type webhook
\`\`\`

### 2. 日志过滤
\`\`\`bash
display notification log start-time 2024-01-01 00:00:00
display notification log end-time 2024-01-02 00:00:00
display notification log status failed
\`\`\`

### 3. 日志导出
\`\`\`bash
export notification log tftp://192.168.1.100/logs/notifications.csv
\`\`\`

### 4. 日志清理
\`\`\`bash
clear notification log before 2024-01-01
\`\`\``,
      tags: ['日志', '通知', '审计'],
      createdBy: '系统',
      createdAt: new Date(now - 4752000000).toISOString(),
      updatedAt: new Date(now - 4752000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '57',
      title: '告警静默配置',
      category: '通知推送',
      content: `## 告警静默配置

### 1. 时间静默
\`\`\`bash
# 配置维护窗口
maintenance-window daily 02:00-04:00
maintenance-window weekly saturday 00:00-24:00
maintenance-window monthly 1 00:00-24:00
\`\`\`

### 2. 对象静默
\`\`\`bash
# 针对特定设备静默
alert-suppression device SW-01
alert-suppression device SW-02

# 针对特定告警类型静默
alert-suppression type device_offline
alert-suppression type ping_timeout
\`\`\`

### 3. 临时静默
\`\`\`bash
# 临时静默30分钟
alert-suppression temporary 30m
alert-suppression temporary device SW-01 1h
\`\`\`

### 4. 查看静默状态
\`\`\`bash
display alert-suppression status
\`\`\``,
      tags: ['告警静默', '维护窗口', '抑制'],
      createdBy: '系统',
      createdAt: new Date(now - 4838400000).toISOString(),
      updatedAt: new Date(now - 4838400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '58',
      title: '通知渠道优先级配置',
      category: '通知推送',
      content: `## 通知渠道优先级

### 1. 渠道优先级设置
\`\`\`bash
# 配置通知渠道优先级
notification-priority level critical
notification-priority channel sms
notification-priority channel email
notification-priority channel wechat

notification-priority level major
notification-priority channel email
notification-priority channel wechat

notification-priority level minor
notification-priority channel wechat
\`\`\`

### 2. 多渠道通知配置
\`\`\`bash
# 配置同时发送到多个渠道
notification-multi channel email wechat dingtalk
notification-multi level critical
\`\`\`

### 3. 渠道故障转移
\`\`\`bash
# 配置故障转移
notification-fallback primary email
notification-fallback secondary sms
notification-fallback timeout 30s
\`\`\``,
      tags: ['通知渠道', '优先级', '故障转移'],
      createdBy: '系统',
      createdAt: new Date(now - 4924800000).toISOString(),
      updatedAt: new Date(now - 4924800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '59',
      title: '告警通知API接口',
      category: '通知推送',
      content: `## 告警通知API

### 1. 获取告警列表
\`\`\`bash
GET /api/alerts
参数:
- level: 告警级别过滤
- status: 告警状态过滤
- page: 页码
- size: 每页数量
\`\`\`

### 2. 创建告警
\`\`\`bash
POST /api/alerts
{
  "level": "critical",
  "type": "device_offline",
  "message": "设备离线",
  "source": "SW-01",
  "timestamp": "2024-01-01T00:00:00Z"
}
\`\`\`

### 3. 确认告警
\`\`\`bash
PUT /api/alerts/{id}/acknowledge
{
  "acknowledgedBy": "admin",
  "comment": "已确认，正在处理"
}
\`\`\`

### 4. 配置通知规则
\`\`\`bash
POST /api/notification/rules
{
  "name": "紧急告警规则",
  "level": "critical",
  "channels": ["sms", "email", "wechat"],
  "escalationDelay": "5m"
}
\`\`\``,
      tags: ['API', '告警', '通知'],
      createdBy: '系统',
      createdAt: new Date(now - 5011200000).toISOString(),
      updatedAt: new Date(now - 5011200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '60',
      title: '通知推送最佳实践',
      category: '通知推送',
      content: `## 通知推送最佳实践

### 1. 告警分级策略
- Critical: 立即通知，多渠道同步推送
- Major: 5分钟延迟后通知
- Minor: 15分钟延迟后通知
- Warning: 30分钟延迟后通知

### 2. 通知频率控制
- 同类告警5分钟内只通知一次
- 同一设备告警10分钟内最多通知3次
- 夜间(22:00-08:00)只推送Critical级别

### 3. 值班轮询机制
- 7x24小时覆盖
- 明确交接流程
- 配置备班人员

### 4. 通知验证
- 定期测试通知渠道
- 检查通知日志
- 收集反馈意见

### 5. 持续优化
- 分析告警噪音
- 调整告警阈值
- 优化通知策略`,
      tags: ['最佳实践', '通知', '告警'],
      createdBy: '系统',
      createdAt: new Date(now - 5097600000).toISOString(),
      updatedAt: new Date(now - 5097600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    })

    // IP管理 (15条)
    articles.push({
      id: '61',
      title: 'IP地址规划设计',
      category: 'IP管理',
      content: `## IP地址规划设计

### 1. 规划原则
- 按部门/功能划分网段
- 预留扩展空间(建议20%)
- 划分管理地址段
- 配置地址池范围

### 2. IP地址分类
\`\`\`bash
# 示例规划
192.168.0.0/16 - 内网地址空间
  ├── 192.168.1.0/24 - 管理VLAN
  ├── 192.168.10.0/24 - 业务VLAN
  ├── 192.168.20.0/24 - 办公VLAN
  ├── 192.168.30.0/24 - 服务器VLAN
  └── 192.168.100.0/24 - DMZ区域
\`\`\`

### 3. 保留地址规划
- 网关地址: 网段第一个可用地址
- DNS服务器: 固定分配
- NTP服务器: 固定分配
- 监控服务器: 固定分配

### 4. 文档记录
- IP地址规划表
- 地址分配记录
- 变更历史`,
      tags: ['IP规划', '地址分配', '网络设计'],
      createdBy: '系统',
      createdAt: new Date(now - 5184000000).toISOString(),
      updatedAt: new Date(now - 5184000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '62',
      title: 'IP地址池管理',
      category: 'IP管理',
      content: `## IP地址池管理

### 1. 创建地址池
\`\`\`bash
# 创建DHCP地址池
ip pool 业务池
 network 192.168.10.0 mask 255.255.255.0
 gateway-list 192.168.10.1
 dns-list 8.8.8.8
 lease day 7
\`\`\`

### 2. 配置排除地址
\`\`\`bash
# 排除固定分配的地址
excluded-ip-address 192.168.10.1 192.168.10.50
\`\`\`

### 3. 查看地址池状态
\`\`\`bash
display ip pool
display ip pool 业务池
display ip pool used
\`\`\`

### 4. 地址池维护
\`\`\`bash
# 扩展地址池
ip pool 业务池
 network 192.168.10.0 mask 255.255.254.0

# 收缩地址池
ip pool 业务池
 network 192.168.10.0 mask 255.255.255.0
\`\`\``,
      tags: ['IP池', 'DHCP', '地址管理'],
      createdBy: '系统',
      createdAt: new Date(now - 5270400000).toISOString(),
      updatedAt: new Date(now - 5270400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '63',
      title: 'IP分配记录管理',
      category: 'IP管理',
      content: `## IP分配记录管理

### 1. 分配记录格式
\`\`\`bash
# 记录示例
IP地址          设备名      MAC地址       分配类型  到期时间
192.168.10.10   SW-01       00:11:22:33:44:55  静态    永久
192.168.10.100  PC-001      AA:BB:CC:DD:EE:FF  动态    2024-01-10
192.168.10.101  Server-01   11:22:33:44:55:66  静态    永久
\`\`\`

### 2. 静态IP分配
\`\`\`bash
# 配置静态绑定
dhcp static-bind ip-address 192.168.10.10 mac-address 00:11:22:33:44:55
dhcp static-bind ip-address 192.168.10.10 description "核心交换机"
\`\`\`

### 3. 查询分配记录
\`\`\`bash
display dhcp server ip-in-use
display dhcp server ip-in-use ip-address 192.168.10.10
display dhcp server ip-in-use mac-address 00:11:22:33:44:55
\`\`\`

### 4. 导出分配记录
\`\`\`bash
export dhcp server ip-in-use tftp://192.168.1.100/ip_allocation.csv
\`\`\``,
      tags: ['IP分配', '记录', 'DHCP'],
      createdBy: '系统',
      createdAt: new Date(now - 5356800000).toISOString(),
      updatedAt: new Date(now - 5356800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '64',
      title: 'IP地址冲突检测',
      category: 'IP管理',
      content: `## IP地址冲突检测

### 1. 启用冲突检测
\`\`\`bash
# 启用DHCP冲突检测
dhcp server ping enable
dhcp server ping timeout 1000
dhcp server ping max-retry 3
\`\`\`

### 2. 手动检测冲突
\`\`\`bash
# 使用arping检测
arping -c 3 192.168.10.100

# 使用ping检测
ping -c 1 192.168.10.100

# 查看ARP表
display arp
display arp ip-address 192.168.10.100
\`\`\`

### 3. 冲突处理流程
1. 检测到冲突
2. 记录冲突信息
3. 通知管理员
4. 停用冲突地址
5. 排查原因

### 4. 查看冲突日志
\`\`\`bash
display dhcp server conflict-log
\`\`\``,
      tags: ['IP冲突', '检测', 'ARP'],
      createdBy: '系统',
      createdAt: new Date(now - 5443200000).toISOString(),
      updatedAt: new Date(now - 5443200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '65',
      title: 'IPv6地址规划',
      category: 'IP管理',
      content: `## IPv6地址规划

### 1. IPv6地址结构
\`\`\`bash
# IPv6地址格式
2001:0db8:85a3:0000:0000:8a2e:0370:7334

# 简化表示
2001:db8:85a3::8a2e:370:7334
\`\`\`

### 2. 地址类型
- 全球单播地址: 2001::/3
- 链路本地地址: fe80::/10
- 站点本地地址: fc00::/7
- 回环地址: ::1/128

### 3. IPv6地址规划示例
\`\`\`bash
# 企业IPv6地址空间
2001:db8:1000::/40 - 总部
  ├── 2001:db8:1001::/48 - 业务网络
  ├── 2001:db8:1002::/48 - 办公网络
  └── 2001:db8:1003::/48 - 服务器网络

# 子网划分
2001:db8:1001:0001::/64 - VLAN 101
2001:db8:1001:0002::/64 - VLAN 102
\`\`\`

### 4. IPv6配置示例
\`\`\`bash
interface Vlanif100
 ipv6 enable
 ipv6 address 2001:db8:1001:1::1/64
\`\`\``,
      tags: ['IPv6', '地址规划', '网络'],
      createdBy: '系统',
      createdAt: new Date(now - 5529600000).toISOString(),
      updatedAt: new Date(now - 5529600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '66',
      title: 'IP地址审计',
      category: 'IP管理',
      content: `## IP地址审计

### 1. 审计范围
- 所有IP地址使用情况
- 静态分配地址
- 动态分配地址
- 保留地址

### 2. 审计步骤
\`\`\`bash
# 1. 获取当前IP使用情况
display ip pool
display dhcp server ip-in-use

# 2. 获取ARP表
display arp

# 3. 获取设备接口地址
display ip interface brief

# 4. 对比分析
# - 已分配vs已使用
# - 静态vs动态
# - 有效vs无效
\`\`\`

### 3. 审计报告内容
- IP地址使用率
- 地址池利用率
- 冲突地址列表
- 异常使用情况

### 4. 审计频率
- 月度审计
- 季度全面审计
- 重大变更后审计`,
      tags: ['IP审计', '合规', '安全'],
      createdBy: '系统',
      createdAt: new Date(now - 5616000000).toISOString(),
      updatedAt: new Date(now - 5616000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '67',
      title: 'IP地址回收',
      category: 'IP管理',
      content: `## IP地址回收

### 1. 回收策略
- 动态地址: 租期到期自动回收
- 静态地址: 手动回收
- 长期未使用: 定期清理

### 2. 手动回收
\`\`\`bash
# 删除静态绑定
undo dhcp static-bind ip-address 192.168.10.10

# 释放动态地址
dhcp server release ip-address 192.168.10.100
\`\`\`

### 3. 批量回收
\`\`\`bash
# 批量删除静态绑定
undo dhcp static-bind all

# 释放所有动态地址
dhcp server release all
\`\`\`

### 4. 回收通知
- 通知地址使用者
- 更新地址规划文档
- 记录回收原因`,
      tags: ['IP回收', '地址管理', '清理'],
      createdBy: '系统',
      createdAt: new Date(now - 5702400000).toISOString(),
      updatedAt: new Date(now - 5702400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '68',
      title: 'IP地址预留',
      category: 'IP管理',
      content: `## IP地址预留

### 1. 预留原则
- 按业务增长预留(建议20%)
- 预留管理地址段
- 预留特殊用途地址

### 2. 预留类型
- 网关地址预留
- DNS/NTP服务器预留
- 监控服务器预留
- 备份设备预留

### 3. 预留配置
\`\`\`bash
# 在地址池中排除预留地址
ip pool 业务池
 excluded-ip-address 192.168.10.1 192.168.10.10
 excluded-ip-address 192.168.10.250 192.168.10.254
\`\`\`

### 4. 预留文档
- 记录预留地址范围
- 记录预留用途
- 定期审查预留使用`,
      tags: ['IP预留', '地址规划', '预留'],
      createdBy: '系统',
      createdAt: new Date(now - 5788800000).toISOString(),
      updatedAt: new Date(now - 5788800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '69',
      title: 'IP地址变更管理',
      category: 'IP管理',
      content: `## IP地址变更管理

### 1. 变更流程
1. 提交变更申请
2. 评估变更影响
3. 执行变更操作
4. 验证变更效果
5. 记录变更历史

### 2. 变更类型
- IP地址修改
- 子网划分调整
- 地址池扩展/收缩
- 网关地址变更

### 3. 变更命令
\`\`\`bash
# 修改接口IP
interface Vlanif10
 undo ip address 192.168.10.1 255.255.255.0
 ip address 192.168.20.1 255.255.255.0

# 修改地址池
ip pool 业务池
 undo network 192.168.10.0 mask 255.255.255.0
 network 192.168.20.0 mask 255.255.255.0
\`\`\`

### 4. 变更验证
\`\`\`bash
# 验证连通性
ping 192.168.20.1

# 验证地址池
display ip pool

# 验证路由
display ip routing-table
\`\`\``,
      tags: ['IP变更', '变更管理', '流程'],
      createdBy: '系统',
      createdAt: new Date(now - 5875200000).toISOString(),
      updatedAt: new Date(now - 5875200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '70',
      title: 'IP地址管理工具',
      category: 'IP管理',
      content: `## IP地址管理工具

### 1. 常用工具
- IPAM (IP Address Management)
- SolarWinds IPAM
- Infoblox
- phpIPAM (开源)

### 2. 工具功能
- IP地址追踪
- 地址池管理
- 冲突检测
- 报告生成

### 3. 集成API
\`\`\`bash
# REST API示例
# 获取IP地址信息
GET /api/ip/192.168.10.10

# 分配IP地址
POST /api/ip/assign
{
  "ip": "192.168.10.100",
  "hostname": "Server-01",
  "description": "Web服务器"
}

# 释放IP地址
DELETE /api/ip/192.168.10.100
\`\`\`

### 4. 自动化集成
- 自动发现IP使用
- 自动检测冲突
- 自动生成报告`,
      tags: ['IPAM', '工具', '管理'],
      createdBy: '系统',
      createdAt: new Date(now - 5961600000).toISOString(),
      updatedAt: new Date(now - 5961600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '71',
      title: 'IP地址监控',
      category: 'IP管理',
      content: `## IP地址监控

### 1. 监控指标
- IP地址可用性
- 地址池利用率
- 冲突检测
- 租期状态

### 2. 监控配置
\`\`\`bash
# 配置IP可用性监控
monitor ip-availability 192.168.10.1
monitor ip-availability 192.168.10.254

# 配置地址池利用率告警
alert-threshold ip-pool-usage 80%
alert-threshold ip-pool-usage 90% critical
\`\`\`

### 3. 告警配置
\`\`\`bash
# IP不可达告警
alert ip-unreachable level critical
alert ip-unreachable notify admin@example.com

# 地址池使用率告警
alert ip-pool-usage level warning
alert ip-pool-usage notify team@example.com
\`\`\`

### 4. 监控报告
- 每日IP使用报告
- 地址池利用率趋势
- 冲突历史统计`,
      tags: ['IP监控', '告警', '可用性'],
      createdBy: '系统',
      createdAt: new Date(now - 6048000000).toISOString(),
      updatedAt: new Date(now - 6048000000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '72',
      title: 'IP地址标签管理',
      category: 'IP管理',
      content: `## IP地址标签管理

### 1. 标签类型
- 用途标签: 服务器、网络设备、终端
- 部门标签: IT部、财务部、市场部
- 位置标签: 机房A、机房B、办公室
- 状态标签: 在用、备用、已回收

### 2. 配置标签
\`\`\`bash
# 配置地址标签
ip-tag 192.168.10.10 type server
ip-tag 192.168.10.10 department IT
ip-tag 192.168.10.10 location 机房A
ip-tag 192.168.10.10 status active
\`\`\`

### 3. 查询标签
\`\`\`bash
# 按标签查询
display ip-tag type server
display ip-tag department IT
display ip-tag status active

# 组合查询
display ip-tag type server department IT
\`\`\`

### 4. 标签导出
\`\`\`bash
export ip-tag tftp://192.168.1.100/ip_tags.csv
\`\`\``,
      tags: ['IP标签', '分类', '管理'],
      createdBy: '系统',
      createdAt: new Date(now - 6134400000).toISOString(),
      updatedAt: new Date(now - 6134400000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '73',
      title: 'IP地址黑名单',
      category: 'IP管理',
      content: `## IP地址黑名单

### 1. 黑名单用途
- 阻止恶意IP访问
- 限制异常IP连接
- 隔离受感染设备

### 2. 配置黑名单
\`\`\`bash
# 添加单个IP到黑名单
ip-blacklist add 192.168.10.100

# 添加IP段到黑名单
ip-blacklist add 192.168.10.0 255.255.255.0

# 配置黑名单规则
ip-blacklist rule deny-all
ip-blacklist rule log-enable
\`\`\`

### 3. 查看黑名单
\`\`\`bash
display ip-blacklist
display ip-blacklist statistics
\`\`\`

### 4. 移除黑名单
\`\`\`bash
ip-blacklist remove 192.168.10.100
ip-blacklist clear
\`\`\``,
      tags: ['IP黑名单', '安全', '访问控制'],
      createdBy: '系统',
      createdAt: new Date(now - 6220800000).toISOString(),
      updatedAt: new Date(now - 6220800000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '74',
      title: 'IP地址白名单',
      category: 'IP管理',
      content: `## IP地址白名单

### 1. 白名单用途
- 允许特定IP访问
- 限制管理访问来源
- 保护敏感服务

### 2. 配置白名单
\`\`\`bash
# 添加管理IP到白名单
ip-whitelist add 192.168.1.0 255.255.255.0 description "管理网段"

# 配置SSH访问白名单
ssh server acl 2000
acl 2000 rule permit source 192.168.1.0 0.0.0.255
acl 2000 rule deny
\`\`\`

### 3. 应用白名单
\`\`\`bash
# 应用到服务
http server acl 2000
snmp-agent acl 2000
\`\`\`

### 4. 查看白名单
\`\`\`bash
display ip-whitelist
display acl 2000
\`\`\``,
      tags: ['IP白名单', '安全', '访问控制'],
      createdBy: '系统',
      createdAt: new Date(now - 6307200000).toISOString(),
      updatedAt: new Date(now - 6307200000).toISOString(),
      viewCount: 0,
      isFavorite: false
    },
    {
      id: '75',
      title: 'IP地址管理最佳实践',
      category: 'IP管理',
      content: `## IP地址管理最佳实践

### 1. 规划阶段
- 合理划分网段
- 预留扩展空间
- 文档化规划

### 2. 分配阶段
- 使用DHCP动态分配
- 关键设备静态绑定
- 记录分配信息

### 3. 监控阶段
- 定期审计IP使用
- 检测地址冲突
- 监控地址池利用率

### 4. 维护阶段
- 及时回收闲置IP
- 定期更新文档
- 变更流程化

### 5. 安全阶段
- 配置访问控制列表
- 启用冲突检测
- 定期安全审计`,
      tags: ['IP管理', '最佳实践', '规划'],
      createdBy: '系统',
      createdAt: new Date(now - 6393600000).toISOString(),
      updatedAt: new Date(now - 6393600000).toISOString(),
      viewCount: 0,
      isFavorite: false
    })

    return articles
  }

  function saveArticles() {
    // 同时保存到数据库和localStorage（备份）
    saveToDB(ARTICLES_DATA_TYPE, articles.value)
    try {
      localStorage.setItem('netops_knowledge_base', JSON.stringify(articles.value))
    } catch (e) {
      console.error('保存知识库到localStorage失败:', e)
    }
  }

  const sortedArticles = computed(() => {
    return [...articles.value].sort((a, b) => 
      new Date(b.updatedAt) - new Date(a.updatedAt)
    )
  })

  const favoriteArticles = computed(() => {
    return articles.value.filter(a => a.isFavorite)
  })

  function getArticlesByCategory(category) {
    return articles.value.filter(a => a.category === category)
  }

  function getArticleById(id) {
    return articles.value.find(a => a.id === id)
  }

  function addArticle(article) {
    const newArticle = {
      id: Date.now().toString(),
      ...article,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      viewCount: 0,
      isFavorite: false
    }
    articles.value.unshift(newArticle)
    saveArticles()
    return newArticle
  }

  function updateArticle(id, updates) {
    const index = articles.value.findIndex(a => a.id === id)
    if (index !== -1) {
      articles.value[index] = {
        ...articles.value[index],
        ...updates,
        updatedAt: new Date().toISOString()
      }
      saveArticles()
    }
  }

  function deleteArticle(id) {
    const index = articles.value.findIndex(a => a.id === id)
    if (index !== -1) {
      articles.value.splice(index, 1)
      saveArticles()
    }
  }

  function toggleFavorite(id) {
    const article = getArticleById(id)
    if (article) {
      article.isFavorite = !article.isFavorite
      saveArticles()
    }
  }

  function incrementViewCount(id) {
    const article = getArticleById(id)
    if (article) {
      article.viewCount = (article.viewCount || 0) + 1
      saveArticles()
    }
  }

  function searchArticles(query) {
    const lowerQuery = query.toLowerCase()
    return articles.value.filter(a => 
      a.title.toLowerCase().includes(lowerQuery) ||
      a.content.toLowerCase().includes(lowerQuery) ||
      a.tags.some(t => t.toLowerCase().includes(lowerQuery))
    )
  }

  const allTags = computed(() => {
    const tags = new Set()
    articles.value.forEach(article => {
      article.tags.forEach(tag => tags.add(tag))
    })
    return Array.from(tags)
  })

  function getArticlesByTag(tag) {
    return articles.value.filter(a => a.tags.includes(tag))
  }

  return {
    articles,
    categories,
    sortedArticles,
    favoriteArticles,
    allTags,
    getArticleById,
    getArticlesByCategory,
    addArticle,
    updateArticle,
    deleteArticle,
    toggleFavorite,
    incrementViewCount,
    searchArticles,
    getArticlesByTag
  }
})
