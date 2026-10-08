# 六阶段图片自查与白底修订

旧版存在外观错误。阶段技术、机型年份基本正确，但首轮主要依据文字提示生成，未充分约束实际外形，导致机架、面板、键盘等细节偏离实物。本轮直接查看并使用博物馆、IBM官方公开实物照片作为 image_gen 参考，重画六张。

| 图片 | 旧版发现的问题 | 新版修订与依据 |
|---|---|---|
| 01_mechanical.png | 差分机的黑铁粗框架、厚数轮、侧面巨大手柄均偏离所选1832年部分装置 | 以[科学博物馆馆藏](https://collection.sciencemuseumgroup.org.uk/objects/co62243/difference-engine-no-1-difference-engine-portion-only)高清完整照片与局部照片为依据，改成黄铜框架、细数轮和银色数码带，删除臆造的大手柄 |
| 02_electromechanical.png | 木制控制台和圆形键组未对应本套选用的1964年Z3复原机照片 | 以[计算机历史博物馆Z3照片](https://www.computerhistory.org/tdih/may/12/)为依据，改成竖直读出面板与下方倾斜输入面板，删除无外观参考的胶片阅读器。此图对应后期复原机，不是1941年原机照片 |
| 03_vacuum_tube.png | ENIAC机柜表面被同样的大旋钮重复填满，右侧开柜发光电子管为艺术添加 | 以[馆藏1946年前后安装照片](https://www.computerhistory.org/chess/stl-42fa8835902f1/)为依据，恢复不同面板分区与下方插线，取消臆造的发光开柜。整体安装布局属于教学复原示意，不宣称逐一复原完整柜体总数 |
| 04_transistor.png | IBM 1401 CPU被画成宽横向多行灯阵；这是明显外观错误 | 以[IBM官方1401历史及实物照片](https://www.ibm.com/history/1401)为依据，改为左侧窄竖向黑色控制面板、右侧宽实心柜门 |
| 05_integrated_circuit.png | PDP-8/e被画成高大落地柜，面板多排全宽灯阵、上方裸露电路板也不符合所选基础机型外观 | 以[计算机历史博物馆](https://www.computerhistory.org/chess/art-431614f436eaf/)照片和[大学博物馆展示的原厂广告](https://ub.fnwi.uva.nl/computermuseum/pdp8e.html)为依据，改为紧凑卧式CPU箱，封闭顶盖，恢复小灯组、单排拨键及选择旋钮 |
| 06_microprocessor.png | IBM PC的大体结构正确，但Model F键帽文字和部分键位生成失真 | 以[IBM官方原机与键盘照片](https://www.ibm.com/history/personal-computer)为依据，修正83键结构、左侧双列F1—F10功能键与右侧组合数字键区，关闭屏幕以去除额外文字 |

## 输出要求

二次复查另发现 PDP-8/e 重画版的位编号及电源开关有误，已依据[设备持有者提供的面板布局](https://www.pdp8online.com/interface/pdp8e/front_panel.shtml)进一步修正为 0—11 编号、十二位数据拨键和左侧旋转钥匙电源。IBM PC 重画版的左侧功能键存在重复编号，已再按官方键盘照片修正为两列五行 F1—F10。打包版本采用这些最终修正版。

六张独立PNG，保留Blender写实风格；去掉全部旁边说明文字、年份、标题与页脚；纯白背景，无灰色渐变、布景、桌面、明显地面投影或晕圈。机器本体必要的数轮、按键文字和原厂标识保留，这些属于实物构造。

图仍为AI参考复原，机型形态已加强约束，不能视为每个器件均与馆藏实物对应的工程模型。尤其是齿轮、继电器数量、线路以及微小文字，未作逐个机械/电路结构验证。

参考照片仅用于内部核对，不打包为本套原创素材交付；公开照片的权利归原发布方。生成提示词及参考路径见 prompts.md。

