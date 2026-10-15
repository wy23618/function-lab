# 验收记录

需求来源：`specification.txt`（用户所附规格的提取文本）。全部五阶段在同一本地应用中集成。以下以功能需求编号对应实现与证据；模型调度和上下文说明作为执行规划处理，不作为产品界面内容。

| 需求                                                                                 | 实现与验收证据                                                                                           |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1 输入即图、术语操作、保留原函数、公式和几何解释联动                                 | App 输入草稿曲线和说明区域；浏览器添加/预览/保留流程                                                     |
| 2 表达式、自然输入、数学键盘、中文错误                                               | expressionParser；math.test、acceptance.test；键盘括号与 e^(Πx) 浏览器回归                               |
| 3 多函数、颜色、名称、表达式、显隐/删除/复制/编辑/锁定/改色、选择、单独看、全部/适应 | FunctionList、chooseFunctionColor；advanced-browser-check；colors.test                                   |
| 4 五种对称、独立生成对象、y=x 参考线                                                 | transformEngine、关系模型；transform.test、graphRange.test；几何浏览器流程                               |
| 5 定义域完整反函数判断、平方限制分支、关系与反函数区分、域交换解释                   | inverseEngine；math.test、trigInverse.test、acceptance.test；限制域后求反函数浏览器流程                  |
| 6 平移/伸缩、滑块与数字、实时公式/图像/解释                                          | App 预览与生成；transform.test；advanced-browser-check                                                   |
| 7 四种绝对值、左右/上下翻折、原图叠加                                                | transform.test、acceptance.test；伸缩/绝对值浏览器流程                                                   |
| 8 任意直线 x=a/y=b/y=kx+b/一般式、点反射及垂线                                       | symmetryEngine、GraphCanvas；transform.test；analysis-browser-check                                      |
| 9 奇偶性、零点、交点、定义域、导函数、切点值/斜率/方程与图像                         | analysisEngine、numericalDerivative；math.test、derivative.test、acceptance.test；analysis-browser-check |
| 10 缩放/拖动/复位/适应、等单位、网格/轴/刻度、全屏、悬停十字和固定点、重采样         | GraphCanvas；graphRange.test；browser-check；桌面/手机截图复核                                           |
| 11 sqrt/ln 实数域、1/x/tan/偏移与小幅/偶阶极点不跨接、高频函数与视口变化采样         | functionSampler；sampling.test、math.test、acceptance.test；检测每一段横坐标范围，而非只检测段数         |
| 12 分组中文工具、Ctrl+K 搜索并执行、常用快捷操作                                     | App 分组与命令面板；advanced-browser-check 的 Ctrl+K 与 Enter                                            |
| 13 连续历史、撤销/重做、parentFunctionId/transformHistory、每步公式                  | transformEngine；transform.test；browser-check、advanced-browser-check                                   |
| 14 三栏、图像中心、面板折叠、轻量克制布局、小屏                                      | styles.css 与 GraphCanvas；两种宽度截图与浏览器无溢出/折叠检查                                           |
| 15 即时输入、少点击、保留与新颜色、可隐藏、中文和标准表达                            | UI 操作验收和颜色独立性测试                                                                              |
| 16 本地 React/TS/Vite、开源计算、计算与 UI 分离、模块目录                            | package/源码结构；类型、lint、生产构建；无付费 API/服务器账户                                            |
| 17 统一函数与变换模型、关系模型、父来源与历史                                        | types/function；序列化验证和 relation 递归测试                                                           |

## 规格附录 B 的操作案例

`x²` 关于 Y 轴、`x³` 关于原点、平方镜像关系、限制平方的 √x 反函数、1/x 与 tan 极点、sin/cos 叠加、平方右移 2、平方 f(|x|)、立方 f(|x|) 均有数学回归或浏览器流程证据。

## 执行与交付

在公共模型建立后，独立子任务完成画布和数学服务；核心数学修复、集成与最终验收由主任务负责。各阶段任务已记录在 `TASKS.md`，长期决策保存在 `DEVELOPMENT_STATE.md`。

最终验证：62 项单元测试通过，lint、类型检查和生产构建通过。四组 Chrome 浏览器验收共 48 项检查通过，页面运行错误为 0；桌面、手机、参数与点反射截图已复核。Windows 启动脚本冷启动通过。数值近似与可选后续模块范围详见 README。

追加输入需求覆盖 `sinx`、`e^(Πt)`、`u(t)=m*t+n`、任意单字母变量、参数数字/滑块、`sin(t²)`、`u(v(t))`、受限源定义域、导数参数变更、变量相关变换/定义域/反函数、保存重载及手机参数布局。证据见 expressionInput.test、functionContext.test 和 input-browser-results.json。
