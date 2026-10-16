<!--
==============================================================================
  This one file fills the Work, Research, and About pages.
  Edit it, push it, done. Nothing else needs touching.

  HOW IT WORKS

  #  starts a section (one block on a page)
  ## starts an entry inside that section
  key: value  sets a field, always lowercase key, no spaces in the key
  -  starts a bullet
  anything else is body prose

  SECTION FIELDS

  page:     work | research | about   which page this block appears on
  layout:   cards | log | list | panels | rows
  eyebrow:  small label above the heading
  heading:  the big heading
  accent:   silicon | research | people   colours the eyebrow
  alt:      yes    gives the block the darker background
  tight:    yes    reduces the vertical padding
  Body prose in a section becomes the intro paragraph under the heading.

  ENTRY FIELDS BY LAYOUT

  cards   tag, date, meta, link, wide: yes, specs
  log     when, where, who, metrics
  list    venue, role
  panels  tag, meta, item     bullets become the dotted list
  rows    items

  specs and metrics take pairs separated by |, written label = value
     specs: Process = SKY130 | Die = 388 x 378 um | DRC = clean*
  A * at the end of a value turns it green. Use it for results that passed.
  metrics reads the same way: metrics: AUC = 0.94 | accuracy = 88%

  Inline you can use [link text](https://example.com) and `code`.

  TO ADD A PROJECT: copy any ## block below, change the words, done.
  Order on the page follows order in this file.
==============================================================================
-->


# Chips
page: work
layout: cards
tight: yes
eyebrow: Chips
accent: silicon
heading: RTL, and what happens after it.

## 2×2 systolic array matrix multiplier
tag: Full RTL to GDSII
date: 2026
meta: SystemVerilog · OpenLane · Yosys · OpenROAD · Magic · KLayout
link: https://github.com/raghuavy/2x2_systolic_array_matrix_mult
wide: yes
specs: Process = SKY130 | Die = 388 × 378 µm | Fmax = 50 MHz | Setup / hold = no violations* | DRC = clean* | XOR check = verified*

- Output stationary 2×2 array in SystemVerilog: four processing elements, each a MAC with a local accumulator, operands rippling one hop per cycle. Verified with a skewed input testbench.
- Hardened through the full flow on SKY130, from Yosys synthesis through OpenROAD floorplan, placement, clock tree, and routing, then Magic and KLayout signoff.
- Also exploring RTL and HLS for sparse by sparse matrix multiplication aimed at AI and HPC workloads.

## Multi university SKY130 SoC tapeout
tag: Tapeout, in flight
date: Since 2026
meta: ASIC Network · joint with UC Berkeley
specs: Target = December shuttle | Chassis = Chipyard | Process = SKY130

- Organizing a shared SoC tapeout that uses Chipyard as a common chassis, so schools contribute digital, analog, and accelerator IP into one system instead of separate tiles.
- Set the integration model: SystemVerilog IP drops in as black boxes so Chisel is not a prerequisite, on one baseline fully open source flow every school can run, with Cadence and Synopsys as optional per school extensions.
- Leading cross institution scoping and early block interface definition so contributed IP still integrates during integration week.

## 8 bit posit codec for an open source arithmetic unit
tag: UROP funded
date: Fall 2026
meta: Prof. Yu (Kevin) Cao · three person unit, I own the codec
specs: Codes checked = 256 of 256* | Reference = SoftPosit | Tapeout = TSMC 180 nm, with UCLA

- posit8 with es = 2: a decoder and a round to nearest even encoder in SystemVerilog, plus the shared unpacked interface the multiplier and adder or quire datapaths consume.
- Reusable cocotb and Verilator harness for exhaustive checking against SoftPosit, all 256 codes plus decode and encode round trip identity, scaling to the 65,536 pair check for the full unit.
- Hardening the codec standalone through OpenLane on SKY130 for area, critical path delay, and maximum frequency characterization.

## Pipelined RISC-V processors and an RTL to GDS flow
tag: Cores and flow
date: Since 2026
meta: Stone Arch Silicon · faculty advisor Prof. Yu (Kevin) Cao
wide: yes
specs: ISA = RV32I / RV64I | Depth = 5 stage | Flow = DC + Innovus

- RV32I and RV64I five stage pipelines in Verilog and SystemVerilog, taken through Synopsys Design Compiler and Cadence Innovus.
- Building the club flow that student teams reuse, so a new member can go from a synthesizable module to a placed and routed block without assembling a toolchain first.
- Student led tapeout collaboration with the Berkeley Tapeout Decal, Cornell C2S2, and Georgia Tech Silicon Jackets.


# Posit lab
page: work
layout: widget
widget: posit
anchor: posit
alt: yes
eyebrow: Live demo
heading: The posit8 format, running in your browser.

This is the arithmetic from the codec above, written out in JavaScript so you can poke at it directly. Flip a bit and watch the regime run grow or shrink and the field boundaries move with it. The plot underneath is the reason the format is interesting: accuracy is not spread evenly, it piles up around 1.0 where real workloads live.


# Boards
page: work
layout: cards
eyebrow: Boards
accent: silicon
heading: Mixed signal hardware that has to survive the real world.

## Line following robot controller, rev 3.0
tag: Mixed signal PCB
date: Jul to Oct 2026
meta: SMTA Bright Electronics Manufacturing Challenge · team UMN GND_Hogs
specs: Encoder = 1,080 counts / rev | Sense R = 1 Ω → 0.51 Ω | Next = final, SMTA International

- Five schematic sheets in Altium: PIC18F47Q43 MCU, two TB67H451AFNG H bridges, seven CNY70 reflective sensors, a 74HC595 shift register, MCP73831 Li-ion charger, MCP1802-3.3 LDO.
- Added a quadrature encoder interface for closed loop wheel speed at 1,080 counts per revolution with PI control, the team's judged custom feature.
- During integration, found and fixed two pre existing issues: the motor rail against the H bridge 4.5 V minimum and its 3.8 to 4.2 V UVLO band, and sense resistors from 1 Ω down to 0.51 Ω.
- Shipped the full fabrication and assembly package: ODB++, Gerbers, NC drill, pick and place, BOM, assembly drawing, DRC report.

## Avionics bay PCB and flight state estimator
tag: Flight hardware
date: Since Sep 2024
meta: UMN Rocket Team · GNC and Avionics
specs: Stackup = 4 layer | Buses = CAN, LoRa | Target = flight computer

- Four layer avionics backplane in Altium on a CAN bus, with a separate LoRa telemetry board so telemetry failures cannot take the bus down with them.
- Multi sensor fusion state estimator in MATLAB and Simulink for real time flight phase detection, with embedded C generated for deployment on the flight computer.


# Research log
page: research
layout: log
tight: yes

## Machine learning for signal classification
when: Since Jan 2024
where: LIGO Scientific Collaboration
who: Prof. Michael Coughlin · University of Minnesota
metrics: AUC = 0.94 | accuracy = 88% | peer reviewed = PASP

Built a low latency classifier that separates true astrophysical signals from detector noise on heavily class imbalanced data, published in PASP. Now developing an evidential deep learning framework for anomaly and out of distribution detection that splits predictive uncertainty into aleatoric and epistemic parts, using Dirichlet entropy and mutual information to flag rare events rather than forcing every candidate into a known class.

## Physics informed machine learning
when: Since May 2025
where: DUNE and NOvA
who: DUNE and NOvA Collaborations

Co-developed a composite loss framework that enforces kinematic constraints inside a regression estimator for neutrino energy reconstruction, so the model cannot buy accuracy by quietly violating the physics it is supposed to be measuring. Contributing author, paper in preparation.

## Cryogenic Josephson junction circuits
when: Since Jan 2026
where: Neuromorphic computing
who: Prof. Vlad Pribiag · University of Minnesota

Simulating physics based neuromorphic four tunnel Josephson junction circuits in PyTorch, and running the measurement side of the same question: a dilution refrigerator at millikelvin base temperature, automated through QCoDeS with a Lakeshore 372.

## Anomaly detection for astronomical transients
when: Ongoing
where: Transient classification
who: First author paper in preparation, ApJ

Tracking how a model's belief in a classification moves over the lifetime of a transient, rather than scoring one snapshot. Temporal belief trajectories in an evidential setting give a handle on which objects are genuinely unusual instead of merely early or faint.


# Papers
page: research
layout: list
alt: yes
eyebrow: Papers and honors
accent: research
heading: Written up.

## Astrophysical or Terrestrial: ML Classification of GW Candidates
venue: PASP
role: Published

## Anomaly Detection of Astronomical Transients via Temporal Belief Trajectories in Evidential Deep Learning
venue: ApJ
role: First author, in prep

## SpectraNet
venue: AppleCiDEr II
role: Contributing author

## Can Self-Consistent Kinematic Constraints Be Enforced within Neutrino Energy Estimators?
venue: In prep
role: Contributing author

## NSF MPS-High grant recipient · LIGO Scientific Collaboration member · UMN CSE Dean's List · GPA 3.8
venue: Honors
role: 2024 to now


# Leadership
page: about
layout: panels
tight: yes
eyebrow: Leadership
accent: people
heading: A club, then a network.

## Stone Arch Silicon (SASi)
tag: Founder and president
meta: University of Minnesota · founded 2025 · [club site](https://stone-arch-silicon.github.io/stone-arch-silicon/)

Started the undergraduate ASIC and EDA organization with Prof. Yu (Kevin) Cao and the Minnesota Nano Center, and secured $20,000 in departmental funding from UMN ECE. Student teams work on RISC-V cores, accelerator design, RTL to GDS, tapeout, and EDA tool training. It also anchors the [ASIC Network](https://asicnetwork.net/), a multi university group that now plans shuttle runs together rather than separately.

- UC Berkeley, Tapeout Decal
- Cornell, C2S2
- Georgia Tech, Silicon Jackets
- MIT and others joining

## Lab sections and office hours
tag: Teaching
meta: University of Minnesota · Aug to Dec 2025
item: EE 2361: Introduction to Microcontrollers = PIC24 architecture · about 30 students
item: EE 2301: Digital Systems Design = Boolean logic, FSMs, Verilog, Xilinx FPGAs · about 30 students

Two semesters of watching where students actually get stuck, which is most of the reason the club material is built the way it is.


# Toolbox
page: about
layout: rows
alt: yes
eyebrow: Toolbox
accent: silicon
heading: What I work in.

## HDL
items: Verilog, SystemVerilog, HLS

## Verification
items: cocotb, Verilator, Synopsys VCS

## Digital EDA
items: Synopsys Design Compiler, Cadence Innovus, Vivado

## Open flow
items: OpenLane, Yosys, OpenROAD, Magic, KLayout

## Analog
items: Cadence Virtuoso, HSPICE, LTspice

## Software
items: C and C++ with CUDA, Python, MATLAB, Bash

## ML
items: PyTorch, TensorFlow, scikit-learn, NumPy, Pandas

## Board and bench
items: Altium, SolidWorks, SPI, I2C, UART, JTAG, CAN, LoRa, STM32, PIC24, PIC18, ATmega
