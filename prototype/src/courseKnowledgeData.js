/**
 * 《计算机组成原理》课程概念目录。
 *
 * 概念关系表示理解后续内容所需的教学基础，独立于实验提交顺序。
 * challengeIds 只表示实验涉及的内容；实验完成不能证明概念或整章已经掌握。
 * 未被现有实验直接涉及的概念保留空映射，仍可浏览、查课件和练习。
 */
function concept(chapterId, id, title, summary, deps = [], challengeIds = [], tags = []) {
  return Object.freeze({
    id: `concept-${id}`, chapterId, title, shortTitle: title, summary,
    deps: Object.freeze(deps.map((id) => `concept-${id}`)),
    challengeIds: Object.freeze(challengeIds), tags: Object.freeze(tags),
  });
}

export const COURSE_KNOWLEDGE_DATA = Object.freeze([
  // 第一章：建立整机与系统层次概念。
  concept("ch1", "stored-program", "冯·诺依曼与存储程序", "程序与数据都以二进制形式存入存储器并按地址访问。控制器自动取出、解释和执行指令，构成存储程序与程序控制的基本思想。", [], ["computer-components", "program-flow"], ["冯诺依曼", "Von Neumann"]),
  concept("ch1", "five-components", "计算机五大部件", "运算器、控制器、存储器、输入设备和输出设备分工协作；CPU 包含运算与控制等部件，总线负责连接而不属于五大部件。", [], ["computer-components", "program-flow"]),
  concept("ch1", "hardware-software", "硬件与软件的协同", "硬件提供存储、运算和传送能力，软件通过指令组织这些能力。系统软件管理资源，应用软件解决具体问题，二者共同构成计算机系统。", ["five-components"], []),
  concept("ch1", "system-hierarchy", "计算机系统层次", "从数字逻辑、微体系结构和机器指令，到操作系统、汇编语言与高级语言，各层以约定的接口向上提供能力，并通过翻译或解释连接。", ["hardware-software"], [], ["机器语言", "汇编", "高级语言"]),
  concept("ch1", "program-execution", "程序运行与部件协同", "程序运行时，控制器取指并协调操作数读取、运算和结果保存，输入输出通过接口参与。一次计算依赖多个部件依次传送数据。", ["stored-program", "five-components"], ["program-flow"]),
  concept("ch1", "computer-performance", "计算机性能指标", "响应时间描述完成一次任务的耗时，吞吐率描述单位时间完成的任务数。比较性能需使用相同工作负载，主频与字长不能单独决定快慢。", ["program-execution"], [], ["响应时间", "吞吐率", "主频"]),
  concept("ch1", "development-history", "计算机发展与集成化", "从电子管、晶体管到集成电路与微处理器，器件集成度提升改变了计算机的规模、成本与应用范围；发展过程同时受存储和互连条件影响。", [], []),
  concept("ch1", "computer-applications", "计算机分类与应用", "通用计算机、嵌入式系统与高性能计算面向不同任务，在性能、功耗、实时性和成本之间取舍；组成原理为理解这些选择提供共同基础。", ["five-components"], [], ["嵌入式", "高性能计算"]),

  // 第二章：表示、编码与可表示范围。
  concept("ch2", "positional-number", "进位计数制与位权", "位置计数制中，每一位的权由基数和位置决定，整数与小数分别使用正负次幂。相同位串必须结合基数，才能确定其代表的数值。", [], ["machine-number"], ["二进制", "十六进制", "位权"]),
  concept("ch2", "radix-conversion", "进制转换", "按位权求和可把其他进制转成十进制；整数除基取余、小数乘基取整可反向转换。二进制与八、十六进制可按三位、四位分组互换。", ["positional-number"], [], ["二进制", "八进制", "十六进制"]),
  concept("ch2", "unsigned-number", "无符号数与字长", "n 位无符号整数的范围是 0 到 2 的 n 次方减 1。字长限定可表示范围，运算的进位与截断必须结合位宽理解，不能忽略高位。", ["positional-number"], ["machine-number"]),
  concept("ch2", "signed-representations", "原码、反码与有符号数", "机器数编码把符号与数值写成位串，真值则是它代表的数学值。原码和反码存在两种零的表示，同一位串在不同编码下可能有不同真值。", ["unsigned-number"], ["machine-number"], ["机器数", "真值", "原码", "反码"]),
  concept("ch2", "twos-complement", "补码表示与转换", "补码用模运算统一处理正负整数，使减法可复用加法硬件。n 位补码整数范围为负 2 的 n−1 次方到 2 的 n−1 次方减 1，零的表示唯一。", ["signed-representations"], ["machine-number", "signed-overflow"], ["负数", "two's complement"]),
  concept("ch2", "fixed-point", "定点数与小数点约定", "定点数通过约定小数点位置解释位串，定点整数和定点小数具有不同范围与精度。小数点通常隐含，不作为额外符号存入每个机器字。", ["signed-representations"], [], ["定点整数", "定点小数"]),
  concept("ch2", "signed-range-overflow", "可表示范围与溢出", "运算结果超出当前位宽和编码的可表示范围时发生溢出。有符号溢出不同于无符号进位，扩大位宽前应使用符合编码规则的符号扩展。", ["twos-complement", "fixed-point"], ["signed-overflow"], ["符号扩展", "双符号位", "进位判断"]),
  concept("ch2", "floating-point", "浮点数的阶码与尾数", "浮点数用符号、阶码和尾数表示数值，阶码影响范围，尾数位数影响精度。规格化约束尾数的形式，不能消除有限位数带来的舍入误差。", ["fixed-point", "positional-number"], [], ["规格化", "精度"]),
  concept("ch2", "ieee754", "IEEE 754 浮点编码", "IEEE 754 二进制单精度使用 1 位符号、8 位阶码和 23 位小数字段；阶码使用偏置编码，还约定零、非规格化数、无穷与 NaN 的表示。", ["floating-point"], [], ["float32", "偏置", "NaN"]),
  concept("ch2", "bcd", "十进制编码与 BCD", "BCD 用四个二进制位编码一位十进制数字；8421 码按位权表示 0 到 9。BCD 位串不能直接当普通二进制整数解释，运算后可能需要十进制调整。", ["positional-number"], [], ["8421", "十进制编码"]),
  concept("ch2", "character-codes", "字符编码与 ASCII", "字符编码约定字符到码值的对应关系，字符码与数值编码的语义不同。ASCII 用 7 位编码基本字符，理解字符编码需区分字符、码值和存储字节。", ["unsigned-number"], [], ["ASCII", "字符", "码值"]),
  concept("ch2", "parity-check", "奇偶校验", "增加一位校验位，使码字中 1 的个数满足奇偶约定，可检出奇数个位翻转。单个奇偶位不能定位错误，也不能保证检出偶数个位翻转。", ["unsigned-number"], ["parity-check"], ["校验位", "异或"]),
  concept("ch2", "crc", "循环冗余校验 CRC", "CRC 把数据位串视为二元多项式，通过模 2 除法生成校验余数；接收端按相同生成多项式检查余数。检错能力由多项式和错误模式共同决定。", ["parity-check"], [], ["生成多项式", "模2除法"]),

  // 第三章：组合逻辑、算术与 ALU。
  concept("ch3", "boolean-logic", "布尔逻辑与真值表", "布尔变量只有 0 和 1 两种值，逻辑表达式与真值表描述输入到输出的对应关系。验证组合电路应覆盖全部输入组合，而非只观察一个示例。", ["unsigned-number"], ["and-gate", "or-gate", "not-gate", "xor-gate"]),
  concept("ch3", "boolean-gates", "与、或、非运算", "与运算要求所有条件同时满足，或运算要求至少一个条件满足，非运算反转输入。三种基本运算组合后可构成选择、译码与控制等逻辑网络。", ["boolean-logic"], ["and-gate", "or-gate", "not-gate", "nand-builder"]),
  concept("ch3", "xor-logic", "异或与逻辑等价", "两个输入不同时异或结果为 1，相同时为 0；多个输入的异或可判断 1 的个数的奇偶性。异或同时出现在加法和位与校验位生成中。", ["boolean-logic"], ["xor-gate", "half-adder", "parity-check"], ["XOR", "同或"]),
  concept("ch3", "combinational-logic", "组合逻辑与信号传播", "组合逻辑的输出取决于当前输入，信号经门电路传播形成数据路径。实际器件存在传播延迟，组合逻辑本身不具有跨时钟保存状态的能力。", ["boolean-gates"], ["data-flow", "gate-mux", "address-decoder"], ["数据流", "传播延迟"]),
  concept("ch3", "universal-gates", "与非门与通用逻辑", "与非门可通过自连接实现取反，再组合实现与、或及其他布尔函数。逻辑等价说明同一功能可由不同门网络完成，不能用唯一连线限制正确解。", ["boolean-gates"], ["nand-builder"], ["NAND", "德摩根"]),
  concept("ch3", "half-adder", "半加器", "半加器对两个一位输入求和，和位为异或，进位为与运算。它不接收低位来的进位，因此不能直接作为多位加法器中的通用级。", ["xor-logic", "boolean-gates"], ["half-adder"]),
  concept("ch3", "full-adder", "全加器与进位条件", "全加器同时接收两个加数位和输入进位，输出和位与输出进位。三个输入中至少两个为 1 时产生进位，两个半加器和或门可实现同一功能。", ["half-adder"], ["full-adder", "majority-vote"]),
  concept("ch3", "carry-propagation", "多位加法与进位传播", "多个全加器连接后，低位进位影响高位求和；行波进位逐级传播，其延迟随位数增长。超前进位根据产生与传递条件减少等待级数。", ["full-adder"], ["multi-adder"], ["行波进位", "超前进位"]),
  concept("ch3", "multiplexer", "多路选择器与数据选择", "多路选择器根据选择信号把一路数据送到输出；通常 2 的 n 次方路输入需要 n 位选择码。它改变数据来源，是运算单元和 CPU 数据通路的重要组成。", ["boolean-gates", "combinational-logic"], ["mux", "gate-mux", "alu", "register-enable"], ["MUX", "选择信号"]),
  concept("ch3", "shifts", "逻辑、算术与循环移位", "逻辑移位按规定补零，算术移位结合符号与编码保持数值语义，循环移位把移出位送回另一端。移位是否等价于乘除还取决于溢出和舍入。", ["twos-complement", "fixed-point"], [], ["移位器", "逻辑移位", "算术移位"]),
  concept("ch3", "complement-arithmetic", "补码加减运算", "补码加法让符号位参与运算，减法转成加上减数的补码负值；结果保留约定位宽。计算出的位串需结合溢出标志判断是否仍代表正确真值。", ["twos-complement", "carry-propagation"], ["signed-overflow"]),
  concept("ch3", "overflow-detection", "有符号溢出检测", "同号补码相加而结果异号时发生有符号溢出；也可比较符号位的输入与输出进位。该标志与最高位向外进位含义不同，不能相互替代。", ["complement-arithmetic", "signed-range-overflow"], ["signed-overflow"], ["V", "符号位", "进位"]),
  concept("ch3", "unsigned-multiply", "原码一位乘法", "原码乘法先确定结果符号，再用乘数位控制数值部分的加法与移位。逐位累积部分积，理解寄存器内容变化才能解释最终双倍字长乘积。", ["shifts", "carry-propagation", "signed-representations"], [], ["部分积", "加移位"]),
  concept("ch3", "booth-multiply", "布斯补码乘法", "布斯算法根据乘数相邻两位的组合选择加、减或不变，再进行算术移位，可直接处理补码有符号数。它把连续的 1 转化为较少的加减操作。", ["complement-arithmetic", "shifts"], [], ["Booth", "相邻乘数位"]),
  concept("ch3", "division", "恢复余数与不恢复余数除法", "二进制除法通过试减、余数符号判断、商位生成和移位逐步求商。恢复余数法在试减为负时恢复，不恢复余数法据余数符号选择下一次加减。", ["complement-arithmetic", "shifts"], [], ["商", "余数"]),
  concept("ch3", "floating-arithmetic", "浮点对阶、规格化与舍入", "浮点加减先让小阶向大阶对齐，再运算尾数并规格化，最后按规则舍入并检查溢出。对阶可能损失低位，计算次序会影响有限精度结果。", ["ieee754", "complement-arithmetic", "shifts"], [], ["对阶", "尾数", "舍入"]),
  concept("ch3", "alu", "算术逻辑单元与标志位", "ALU 在控制信号作用下选择算术或逻辑运算，把结果与零、进位、溢出等标志送出。选择网络、加法电路与状态标志共同支持后续指令执行。", ["complement-arithmetic", "multiplexer", "xor-logic"], ["alu"]),

  // 第四章：主存、Cache 和虚拟存储。
  concept("ch4", "memory-hierarchy", "存储器层次", "寄存器、Cache、主存与辅存以不同速度、容量和成本形成层次。上层保存部分下层数据，利用访问规律接近快存储器的速度并获得大容量。", ["five-components"], [], ["Cache", "主存", "辅存"]),
  concept("ch4", "locality", "时间与空间局部性", "时间局部性意味着近期访问的数据可能再次被访问，空间局部性意味着相邻地址也可能被访问。它们解释了小容量缓存为何能服务大量访存请求。", ["program-execution", "memory-hierarchy"], [], ["Cache", "时间局部性", "空间局部性"]),
  concept("ch4", "ram-rom", "RAM、ROM 与存储分类", "RAM 支持随机读写，ROM 系列通常用于保存固件等相对固定内容。存储器还可按易失性、存取方式和用途分类，随机存取并不等于内容永久保存。", ["memory-hierarchy"], []),
  concept("ch4", "sram-dram", "SRAM、DRAM 与刷新", "SRAM 用双稳态电路保持数据，DRAM 以电荷存储数据并需周期刷新。二者在速度、集成密度、功耗和成本之间取舍，分别常用于 Cache 与主存。", ["ram-rom"], [], ["刷新", "电容"]),
  concept("ch4", "memory-organization", "主存组织与地址译码", "存储容量由地址数量和每个单元位数决定，地址译码选中对应单元或芯片。位扩展增加数据宽度，字扩展增加可寻址单元数量，连接方式不同。", ["unsigned-number", "combinational-logic"], ["memory-address", "address-decoder"], ["容量", "字扩展", "位扩展", "片选"]),
  concept("ch4", "memory-read-write", "主存读写与 MAR、MDR", "MAR 保存本次访问地址，MDR 暂存读出或待写数据；读写控制决定操作类型与有效时刻。地址、数据与控制信号配合完成一个存储访问过程。", ["memory-organization"], ["memory-address", "register-enable"], ["MAR", "MDR", "读周期", "写周期"]),
  concept("ch4", "storage-register", "寄存器、状态与写使能", "寄存器由时序电路保存状态，写使能决定有效时钟沿是否更新数据。下一状态选择逻辑可表达保持或写入，但仅求出 Q_next 还不能模拟完整时序存储。", ["multiplexer", "combinational-logic"], ["register-enable"], ["时序逻辑", "时钟", "触发器", "Q_next"]),
  concept("ch4", "cache-mapping", "Cache 地址映像", "直接映像为主存块指定唯一行，全相联允许放入任意行，组相联允许放入指定组的任意行。地址中的标记、索引和块内偏移用于定位并判断命中。", ["locality", "memory-organization"], [], ["Cache", "直接映像", "全相联", "组相联"]),
  concept("ch4", "cache-policies", "Cache 替换、写策略与命中率", "组满时替换策略选择被换出的块；写直达和写回决定何时更新下层。命中率、命中时间与失效代价共同决定平均访问时间，不能只看缓存容量。", ["cache-mapping", "memory-read-write"], [], ["Cache", "LRU", "写直达", "写回", "AMAT"]),
  concept("ch4", "virtual-memory", "虚拟存储与分页", "虚拟存储给程序提供逻辑地址空间，将虚页映射到物理页框；缺页时由操作系统调入所需内容。地址空间扩展依赖主存与辅存协作，不会把磁盘变得与主存一样快。", ["memory-hierarchy", "memory-organization"], [], ["页式", "页表", "缺页", "虚拟地址"]),
  concept("ch4", "segmented-memory", "段式虚拟存储", "段式存储按程序的逻辑模块划分可变长度段，逻辑地址由段号与段内位移组成。段表记录段的基址、长度和保护信息，地址转换需检查位移是否越界。", ["memory-hierarchy", "memory-organization"], [], ["段式", "段表", "段号", "段内位移"]),
  concept("ch4", "segmented-paged-memory", "段页式虚拟存储", "段页式存储先按逻辑模块分段，再把各段划分为固定大小的页。逻辑地址包含段号、页号与页内偏移，依次通过段表与页表获得物理地址，兼顾段的逻辑组织与页的分配方式。", ["virtual-memory", "segmented-memory"], [], ["段页式", "段表", "页表"]),
  concept("ch4", "tlb-translation", "页表与 TLB 地址转换", "分页地址分为页号与页内偏移，页表把虚页号映射为物理页框号；TLB 缓存近期地址转换结果。TLB 未命中需要查页表，并不必然表示页面不在主存。", ["virtual-memory", "cache-mapping"], [], ["TLB", "物理地址", "页内偏移"]),

  // 第五章：指令系统与寻址。
  concept("ch5", "instruction-format", "机器指令与指令格式", "指令中的操作码规定执行什么操作，地址等字段规定操作数或结果位置。指令和数据都以二进制存储，CPU 根据取指与执行阶段解释同一位串。", ["stored-program", "unsigned-number"], ["instruction-data", "opcode-decoder"], ["操作码", "地址码"]),
  concept("ch5", "opcode-encoding", "操作码编码与译码", "操作码的位数决定编码空间，定长编码便于译码，扩展操作码可平衡操作种类与地址字段长度。译码器把某个操作码转换成对应的控制选择。", ["instruction-format", "combinational-logic"], ["opcode-decoder"]),
  concept("ch5", "instruction-addressing", "顺序与跳转的指令寻址", "顺序执行按指令长度更新 PC，跳转、分支与调用则选择目标地址。指令寻址解决下一条指令在哪里的问题，应与取得操作数的数据寻址区分。", ["instruction-format", "program-execution"], ["cpu-datapath", "branch-control"], ["PC", "顺序寻址", "跳跃寻址"]),
  concept("ch5", "immediate-register-addressing", "立即与寄存器寻址", "立即寻址把操作数包含在指令字段中，寄存器寻址在指令中指定寄存器。它们通常减少数据访存，但可表示的立即数范围与寄存器数量受字段位数限制。", ["instruction-format"], []),
  concept("ch5", "direct-indirect-addressing", "直接与间接寻址", "直接寻址的地址字段给出操作数所在地址；间接寻址先取得有效地址再取操作数。间接寻址扩展了灵活性，但可能增加访存次数与执行时间。", ["instruction-format", "memory-read-write"], []),
  concept("ch5", "base-index-addressing", "基址与变址寻址", "基址和变址寻址均用寄存器内容加位移得到有效地址，但基址常用于程序定位，变址常用于数组元素遍历。相同加法形式对应不同使用约定。", ["direct-indirect-addressing"], [], ["有效地址", "EA", "数组", "位移"]),
  concept("ch5", "relative-addressing", "相对寻址与 PC 偏移", "相对寻址用体系结构约定的 PC 基准加有符号位移形成目标地址，常用于分支和可重定位代码。计算时需明确 PC 指向位置以及位移的单位和扩展规则。", ["instruction-addressing", "twos-complement"], [], ["PC", "分支偏移"]),
  concept("ch5", "stack-addressing", "堆栈与零地址指令", "堆栈遵循后进先出，栈指针标识栈顶位置，部分操作数可由栈顶隐含给出。它支持表达式求值、调用返回与现场保存，但栈增长方向由约定决定。", ["instruction-format", "memory-read-write"], [], ["SP", "后进先出", "LIFO"]),
  concept("ch5", "instruction-types", "指令类型与操作数组织", "数据传送、算术逻辑、控制转移和输入输出是常见指令类型。零、一、二、三地址格式在显式操作数数量、隐含位置和指令长度之间作不同取舍。", ["instruction-format", "alu"], []),
  concept("ch5", "risc-cisc", "RISC、CISC 与 Load/Store", "RISC 通常采用较规整的指令与 Load/Store 数据访问方式，CISC 提供较丰富的操作与寻址组合。实际实现会结合多种技术，性能仍需按程序和微体系结构判断。", ["instruction-types", "immediate-register-addressing"], [], ["Load/Store", "精简指令", "复杂指令"]),

  // 第六章：数据通路、控制与流水。
  concept("ch6", "cpu-registers", "CPU 寄存器与状态", "PC 保存待取指令地址，IR 保存当前指令，通用寄存器提供操作数，状态寄存器保存标志。它们各有职责，不能把指令内容与指令地址混为一谈。", ["instruction-format", "storage-register"], ["cpu-datapath", "branch-control"], ["PC", "IR", "PSW", "寄存器堆"]),
  concept("ch6", "instruction-cycle", "指令周期与执行阶段", "一条指令通常经历取指、译码、执行等阶段，是否访存或写回取决于指令类型。教学五阶段模型帮助跟踪数据，不意味着所有 CPU 或指令都严格同形。", ["program-execution", "instruction-types"], ["cpu-datapath"]),
  concept("ch6", "cpu-timing", "时钟、机器与指令周期", "时钟周期提供基本节拍，机器周期表示完成某类基本操作的时间，指令周期包含执行指令所需过程。各层的包含关系和节拍数取决于具体处理器设计。", ["instruction-cycle", "storage-register"], [], ["节拍", "机器周期"]),
  concept("ch6", "cpu-datapath", "CPU 数据通路", "数据通路连接寄存器、ALU、选择器与访存接口，控制信号决定每一步的数据来源、操作和目的位置。按微操作追踪数据，可解释指令如何由硬件完成。", ["cpu-registers", "alu", "memory-read-write"], ["cpu-datapath", "branch-control"]),
  concept("ch6", "hardwired-control", "组合逻辑控制器", "组合逻辑控制器根据操作码、状态和时序直接产生控制信号，响应快但修改控制功能需要调整逻辑。设计时必须保证各节拍信号正确且不发生资源冲突。", ["opcode-encoding", "cpu-datapath", "cpu-timing"], ["branch-control"], ["硬布线", "控制信号"]),
  concept("ch6", "microprogrammed-control", "微程序控制器", "微程序控制器将控制信号组合编码为微指令，并由控存中的微程序组织执行。机器指令与微指令处在不同层次，控存也不同于保存用户程序的主存。", ["cpu-datapath", "cpu-timing"], [], ["控存", "微指令", "微地址"]),
  concept("ch6", "branch-control", "条件分支与 PC 选择", "分支条件与 ALU 标志共同决定是否选择目标地址，无条件跳转则直接选择目标。控制逻辑应区分地址选择信号与目标地址的数值计算。", ["instruction-addressing", "relative-addressing", "cpu-datapath"], ["branch-control"]),
  concept("ch6", "pipeline", "指令流水与吞吐率", "流水线把指令处理分成若干阶段，让不同指令重叠推进以提高吞吐率。理想流水不必缩短单条指令的延迟，阶段不均衡与填充排空也会限制收益。", ["instruction-cycle", "cpu-timing", "cpu-datapath"], [], ["IF", "ID", "EX", "MEM", "WB"]),
  concept("ch6", "pipeline-hazards", "流水线冒险与处理", "结构冒险来自资源竞争，数据冒险来自指令间依赖，控制冒险来自执行路径未定。暂停、旁路和分支预测等方法各有适用条件，处理后才能保持程序语义。", ["pipeline", "branch-control"], [], ["旁路", "暂停", "结构冒险", "数据冒险", "控制冒险"]),
  concept("ch6", "performance-cpi", "CPI 与 CPU 执行时间", "CPU 时间可按指令数、平均 CPI 与时钟周期相乘估算。减少一个因素可能影响另一个因素，比较不同设计应结合相同任务、指令组合和实际停顿。", ["computer-performance", "cpu-timing", "pipeline"], [], ["CPI", "指令数"]),

  // 第七章：互连、仲裁与通信。
  concept("ch7", "bus-functions", "地址、数据与控制总线", "地址信号定位存储或设备，数据信号传送内容，控制信号表明读写和状态。总线方向与当前主从角色有关，DMA 等主设备也可能发起地址传送。", ["five-components", "unsigned-number"], ["system-bus"]),
  concept("ch7", "bus-classification", "片内、系统与通信总线", "按连接范围，片内总线连接芯片内部功能单元，系统总线连接 CPU、主存和 I/O 接口，通信总线用于系统或设备之间的连接。这一分类维度不同于按传送信息划分的地址、数据与控制总线。", ["bus-functions"], [], ["总线分类", "片内总线", "系统总线", "通信总线"]),
  concept("ch7", "bus-structure", "单总线与多总线结构", "单总线让多个部件分时共享通路，结构简单却容易竞争；分层与多总线结构可隔离速度不同的部件。桥接部件协调不同总线间的传送与协议。", ["bus-functions"], []),
  concept("ch7", "bus-bandwidth", "总线宽度、频率与带宽", "总线带宽取决于每次传送位数、有效传送频率与协议开销，峰值带宽不同于持续可用带宽。地址宽度约束地址空间，不能直接当作数据吞吐宽度。", ["bus-functions", "computer-performance"], [], ["带宽", "传送率"]),
  concept("ch7", "bus-arbitration", "总线主控与仲裁", "多个主设备请求共享总线时，仲裁器决定谁获得使用权，并避免同时驱动引发冲突。仲裁策略需在响应时间、优先级与公平性之间取舍。", ["bus-functions", "boolean-gates"], ["bus-arbiter"], ["CPU", "DMA", "请求", "授权"]),
  concept("ch7", "daisy-chain-arbitration", "链式查询判优", "链式查询让授权沿设备顺序传递，连线少且容易扩展，但优先级由连接位置固定决定。链路故障会影响后续设备，低优先级请求也可能长期等待。", ["bus-arbitration"], [], ["固定优先级"]),
  concept("ch7", "request-arbitration", "计数器查询与独立请求", "计数器查询按计数顺序寻找请求者，独立请求为各主设备配置请求与授权通道。前者可轮转安排，后者便于集中决策，但连线和判优逻辑成本更高。", ["bus-arbitration"], [], ["集中式判优", "轮转", "独立请求"]),
  concept("ch7", "bus-communication", "同步、异步与握手通信", "同步通信依赖约定时钟，异步通信通过请求和应答协调传送有效时刻。半同步与分离式通信进一步处理等待或释放总线，选择取决于部件速度与协议。", ["bus-functions", "cpu-timing"], ["system-bus", "io-handshake"], ["握手", "请求应答"]),

  // 第八章：接口与传送方式。
  concept("ch8", "peripheral-classes", "外部设备分类", "外部设备按用途可分为人机交互、机机通信和信息驻留设备，分别承担交互、连接与长期保存信息等任务。输入与输出则按信息传送方向区分，同一设备可能具有多种功能。", ["five-components"], [], ["外设分类", "外部设备分类", "人机交互", "机机通信", "信息驻留"]),
  concept("ch8", "input-devices", "输入设备与信息采集", "输入设备把人的操作或外部信息转换为计算机可处理的数据。键盘、鼠标和扫描仪分别采集按键、位移与图像信息，通常通过接口协调状态查询和数据传送。", ["peripheral-classes"], [], ["输入设备", "键盘", "鼠标", "扫描仪"]),
  concept("ch8", "output-devices", "输出设备与信息呈现", "输出设备把计算结果转成可观察或可记录的信息。显示器按显示接口与屏幕技术呈现图像，打印机把数据形成纸面记录；不同设备在速度、分辨率和输出形式上有不同要求。", ["peripheral-classes"], [], ["输出设备", "显示器", "打印机"]),
  concept("ch8", "io-interface", "I/O 接口与数据缓冲", "I/O 接口提供数据、状态和控制寄存器，完成缓冲、设备选择与信号格式协调。外设与 CPU 速度和信号形式不同，接口为双方提供可约定的交互方式。", ["bus-functions", "storage-register"], ["io-transfer", "io-handshake"], ["外设", "数据寄存器", "状态寄存器"]),
  concept("ch8", "io-addressing", "独立与统一 I/O 编址", "独立编址为 I/O 设置单独地址空间并使用专门访问方式，统一编址把接口寄存器纳入存储地址空间。两者影响指令与地址译码设计，但不改变接口职责。", ["io-interface", "instruction-format"], [], ["内存映射", "端口"]),
  concept("ch8", "unconditional-transfer", "无条件传送", "无条件传送在访问接口时直接读写数据，不先查询就绪状态，也不等待中断请求。它适用于状态可预知且能及时接收或提供数据的简单接口，例如控制 LED，前提是时序条件始终满足。", ["io-interface"], [], ["无条件传送", "LED", "简单设备"]),
  concept("ch8", "programmed-io", "程序查询与条件传送", "程序查询由 CPU 反复读取设备状态，就绪后通过指令传送数据。查询逻辑易于理解，但等待会消耗 CPU 时间；握手保证就绪与读取条件满足才接受数据。", ["io-interface", "bus-communication"], ["io-transfer", "io-handshake"], ["轮询", "Ready", "Read"]),
  concept("ch8", "interrupt-mechanism", "中断请求与响应", "设备通过中断请求通知 CPU，CPU 在允许且满足响应条件时转向服务程序。请求、响应与服务是不同阶段，中断让设备准备与 CPU 执行其他任务能够重叠。", ["io-interface", "instruction-cycle"], ["interrupt-mask"], ["IRQ", "IE"]),
  concept("ch8", "interrupt-service", "中断服务、现场保存与返回", "响应中断需要保存断点与必要现场，识别中断源后执行服务程序，再恢复状态并返回。屏蔽与开放中断的时机需结合处理器和嵌套策略，不能省略现场保护。", ["interrupt-mechanism", "cpu-registers", "stack-addressing"], [], ["中断向量", "断点", "现场"]),
  concept("ch8", "interrupt-priority", "中断屏蔽、优先级与嵌套", "允许位和屏蔽位控制请求能否送达或被响应，优先级决定多个请求的处理次序。中断嵌套允许较高优先级事件打断服务，但需要正确保存与恢复多层现场。", ["interrupt-mechanism", "boolean-gates"], ["interrupt-mask"], ["Mask", "嵌套", "优先级"]),
  concept("ch8", "dma-transfer", "DMA 与周期挪用", "CPU 先设置地址、长度等参数，DMA 控制器再取得总线并在设备与主存之间直接搬运数据，结束后通知 CPU。数据阶段不需 CPU 逐字执行搬运指令，仍存在总线竞争与初始化开销。", ["io-interface", "bus-arbitration", "memory-read-write"], [], ["DMA", "周期挪用", "预处理", "后处理"]),
  concept("ch8", "io-mode-selection", "查询、中断与 DMA 的适用条件", "查询、中断与 DMA 的取舍取决于传送规模、设备速度、响应要求和处理开销。低速零散事件与高速成块数据需求不同，不能在所有任务上简单给出固定效率排名。", ["programmed-io", "interrupt-mechanism", "dma-transfer"], [], ["块传送", "字符设备"]),
]);

/** 历史题库和记录只经这些明确标记迁移；不会把任意 kp 字串变成概念。 */
export const LEGACY_KNOWLEDGE_ALIASES = Object.freeze({
  "kp-computer-components": "concept-five-components",
  "kp-program-flow": "concept-program-execution",
  "kp-machine-number": "concept-twos-complement",
  "kp-data-flow": "concept-combinational-logic",
  "kp-and-gate": "concept-boolean-gates",
  "kp-or-gate": "concept-boolean-gates",
  "kp-not-gate": "concept-boolean-gates",
  "kp-xor-gate": "concept-xor-logic",
  "kp-half-adder": "concept-half-adder",
  "kp-full-adder": "concept-full-adder",
  "kp-multi-adder": "concept-carry-propagation",
  "kp-mux": "concept-multiplexer",
  "kp-alu": "concept-alu",
  "kp-memory-address": "concept-memory-read-write",
  "kp-instruction-data": "concept-instruction-format",
  "kp-cpu-datapath": "concept-cpu-datapath",
  "kp-system-bus": "concept-bus-functions",
  "kp-io-transfer": "concept-programmed-io",
  "kp-parity-check": "concept-parity-check",
  "kp-nand-builder": "concept-universal-gates",
  "kp-majority-vote": "concept-full-adder",
  "kp-gate-mux": "concept-multiplexer",
  "kp-signed-overflow": "concept-overflow-detection",
  "kp-address-decoder": "concept-memory-organization",
  "kp-register-enable": "concept-storage-register",
  "kp-opcode-decoder": "concept-opcode-encoding",
  "kp-branch-control": "concept-branch-control",
  "kp-bus-arbiter": "concept-bus-arbitration",
  "kp-interrupt-mask": "concept-interrupt-priority",
  "kp-io-handshake": "concept-io-interface",
});
