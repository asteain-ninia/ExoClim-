# 実装計画書 : Step2=風帯（抽象循環 + 貿易風/赤道無風帯）/ Step3=海流（既存ロジック固定）/ Step4=気流（詳細） + UIデバッグ

> この計画書は「小さな実装単位で進め、各単位で別担当でも実装できる申し送りを残す」ことを前提にしています。
> **Step3（海流: services/physics/ocean.ts）はロジック改変禁止**（アルゴリズム、数式、意味、結果が変わるリファクタ含む）。

---

## 0. 前提（現状コードの根拠引用）

### 0.1 現状のパイプライン（Step1→Step2=海流）
`services/climateEngine.ts` は Step1でITCZ、Step2で海流を計算しています。

```ts
// services/climateEngine.ts
onProgress(20, "Step 1: Calculating ITCZ...", 'itcz_heatmap');
const circulationRes = computeCirculation(grid, planet, atm, phys, config);

onProgress(50, "Step 2.1: Ocean Currents...", 'oceanCurrent');
const oceanRes = computeOceanCurrents(grid, circulationRes.itczLines, phys, config, planet);
```

### 0.2 風（帯状風）は現状 Step0（初期化）に固定ロジックで埋められている

```ts
// services/climateEngine.ts
// 0-30: Easterlies (-), 30-60: Westerlies (+), 60+: Easterlies (-)
const latAbs = Math.abs(cell.lat);
let baseU = 0;
if (latAbs < 30) baseU = -5;
else if (latAbs < 60) baseU = 8;
else baseU = -2;

const u = baseU * rotationSign;
cell.windU = new Array(12).fill(u);
cell.windV = new Array(12).fill(0);
cell.pressure = new Array(12).fill(1013);
```

### 0.3 海流（既存Step2→新Step3）は ITCZ と `phys.oceanEcLatGap` で赤道海流の分岐緯度を決めている

```ts
// services/physics/ocean.ts
const baseItczLat = itcz[lonIdx];
const ecSeparation = phys.oceanEcLatGap;
let targetLat = baseItczLat;
if (agent.type === 'EC_N') targetLat += ecSeparation;
else targetLat -= ecSeparation;
```

> 重要：この構造は「ITCZに沿う東向きECC」と「ITCZ±gapの西向きEC（北/南）」に相当するモデルで、
> **gap（=赤道海流帯の位置）を風帯から先に決めて渡せる**と、海流Stepを触らずに整合性が取れます。

### 0.4 UI側（上部タブ）が「地形→ITCZ→Ocean」しか無く、風帯のデバッグ導線が弱い

```ts
// App.tsx
const PIPELINE_STEPS = [
  { id: 'elevation', ... },
  { id: 'distCoast', ... },
  { id: 'step1', label: 'Step 1', desc: 'ITCZ', subSteps: [ ... ]},
  { id: 'step2', label: 'Step 2', desc: 'Ocean', subSteps: [ ... ]},
];
```

---

## 1. ブラッシュアップ要求への回答（設計に反映する方針）

### 1.1 「ITCZ周辺の赤道海流を駆動する風」を風帯に含めるか？
含めます。
ただし現行の海流Stepは風を直接参照しないため、**Step2（風帯）が “それに対応する緯度オフセット” を導出して Step3 へ渡す**形で結合します。

- **赤道海流を駆動する地表風**は一般に「貿易風（低緯度の東風）」
- ITCZ直上は収束して上昇するため、地表は弱風（いわゆる無風帯 / doldrums 的な帯）になりやすい
- したがって抽象モデルでは
  - ITCZ付近: 風速弱い + 収束（windV）
  - ITCZから少し離れた両側: 貿易風（windU の東風）が強い
  - この「強い東風帯の中心（ピーク）」を **EC_N/EC_S の目標緯度（gap）** として使う

この計画書では、
- Step2で「ITCZ中心の無風帯 + 両側の貿易風ピーク」を作る
- そのピーク緯度オフセットを `oceanEcLatGapDerived` として出力
- Step3には `phys.oceanEcLatGap` をコピー差し替えで渡す（ocean.tsは不改変）
という設計に更新します。

### 1.2 UIへの反映（プレイスホルダ→段階的精細化→都度デバッグ）
明示します。
- **まずUIに「Step2: Wind」を追加**して“表示できる状態”を先に作る
- 以後のUnitで、同じUI表示が徐々に精細になる（=毎回デバッグできる）
- 併せて、OceanDebugViewに倣い **WindDebugView（風帯デバッグ）** を用意する

---

## 2.0. 重要：申し送り（Handover）の義務化

各 Unit の完了ごとに、必ず `docs/handover/` ディレクトリに以下の内容を含む `UNIT_X_*.md` を作成してください。
これを怠ると、次の Unit への移行時にコンテキストが喪失し、誤った実装が行われるリスクがあります。

**記載必須事項:**
- 完了した Unit の名称と目的
- 変更されたファイルおよび追加されたパラメータ
- 次の Unit への具体的な申し送り事項（TODO）
- 触ってはいけない領域（Step3海流ロジックなど）


## 2. 新パイプライン（Step番号・責務）

- Step0: 地形/距離場の準備 + 配列初期化（既存）
  - **ここでは風帯ロジックを持たない**（固定値埋めを撤去しStep2へ）
- Step1: ITCZ（既存: `computeCirculation`）
- Step2: 風帯（抽象循環 + 貿易風/赤道無風帯）
  - 新設: `computeWindBelts`
- Step3: 海流（既存: `computeOceanCurrents`）
  - **ロジック改変禁止**
- Step4: 気流（詳細）
  - 今回は入口だけ（stub）

### 2.1 依存関係
- Step1 → Step2: `itczLines`, `cellCount`, `hadleyWidth`
- Step2 → Step3: `oceanEcLatGapDerived`（physコピー差し替えで渡す）
- Step3 → Step4: `oceanStreamlines`, `impactPoints`（将来の熱・湿潤入力）

---

## 3. データ契約（I/O仕様）

### 3.1 Step1出力（既存）
**CirculationResult**
- `itczLines: number[][]`  // [month][lon] => lat
- `cellCount: number`      // 半球あたりセル数
- `hadleyWidth: number`    // deg（暫定: 90/cellCount）

### 3.2 Step2出力（改訂）

**WindBeltsResult（提案 / UIデバッグ用に SimulationResult に格納推奨）**
- `hadleyEdgeDeg: number`                     // 亜熱帯高圧帯の目安（帯境界）
- `cellBoundariesDeg: number[]`               // 片半球の境界 [0<B1<B2<...<90]
- `doldrumsHalfWidthDeg: number`              // ITCZ近傍の弱風帯幅（半値幅的な扱い）
- `tradePeakOffsetDeg: number`                // ITCZからの貿易風ピーク距離（=推奨gap）
- `oceanEcLatGapDerived: number`              // Step3に渡す gap（基本は tradePeakOffsetDeg）
- `modelLevel: 'scaffold'|'belts'|'pressure'|'trade'` // UIの段階表示に使用
- `debug: {
    clampInfo?: string[];
    paramsUsed: Record<string, number|string>;
  }`

**副作用（grid更新）**
- `grid[*].windU[12]` : 抽象帯状風（東西）。**貿易風はここに含める**
- `grid[*].windV[12]` : ITCZ収束（南北）
- `grid[*].pressure[12]` : ITCZ低圧 + 境界帯の高低圧（抽象）

### 3.3 Step3（海流）I/O（固定）
- 関数署名/内部ロジックは **変更禁止**
- `runSimulation` 側で渡す `phys` を **コピーして差し替える**のは許容

### 3.4 Step4（詳細気流）I/O（今回は入口のみ）
`computeAirflowDetailed(grid, circulationRes, windRes, oceanRes, planet, atm, phys, config)`
- 今回は中身空でも良い

---

## 4. 追加すべき入力定数（PhysicsParams）

> 目的：Vibe実装でも「パラメータの意味が追える」ように、**物理っぽい名前で“調整つまみ”を外出し**する。

### 4.1 風帯境界（セル境界の作り方）
- `windHadleyWidthScale`（例: 1.0）
- `windJetSpacingExp`（例: 1.2）  // >1 で高緯度ほど間隔が広がる

### 4.2 帯状風U（基本強度）
- `windBaseSpeedEasterly`（例: 5）
- `windBaseSpeedWesterly`（例: 8）
- `windSpeedRotationExp`（例: 0.5）

### 4.3 ITCZ収束V（南北風）
- `windItczConvergenceSpeed`（例: 2）
- `windItczConvergenceWidth`（例: 10°）

### 4.4 気圧帯（可視化＋Step4入力）
- `windPressureAnomalyMax`（例: 20 hPa）
- `windPressureBeltWidth`（例: 8°）

### 4.5 【追加】貿易風/赤道無風帯（赤道海流を駆動する風の抽象モデル）
- `windDoldrumsWidthDeg`（例: 6°）
  - ITCZ近傍で windU を弱める帯の幅
- `windTradePeakOffsetMode`（'abs' | 'hadleyFrac'）
  - `abs`: 定数度数
  - `hadleyFrac`: Hadley端に比例
- `windTradePeakOffsetDeg`（例: 8°） // mode=abs 用
- `windTradePeakOffsetFrac`（例: 0.25） // mode=hadleyFrac 用（30°×0.25=7.5°）
- `windTradePeakWidthDeg`（例: 10°）
  - ピークの広がり（細かすぎると表示がノイジーになる）
- `windTropicalUCap`（例: 10）
  - tropicsの windU 絶対値上限

### 4.6 海流結合（Step3へ渡す派生値のモード）
- `windOceanEcGapMode`（'manual' | 'derivedFromTradePeak'）
- `windOceanEcGapClampMin`（例: 2°）
- `windOceanEcGapClampMax`（例: 20°）

> デフォルト方針：
> - まず `manual` で従来挙動を維持できる
> - 次に `derivedFromTradePeak` をONにして、風帯→海流の整合を取る

---

## 5. UI反映（プレイスホルダ → 段階的精細化 → 都度デバッグ）

### 5.1 上部タブ（PIPELINE_STEPS）を更新
- Step2: Wind（新設）
- Step3: Ocean（既存のOceanを移動）
- Step4: Airflow（placeholder）

**提案サブステップ**
- Step2: `wind`（既存mode） / `wind_belts`（新mode。デバッグ特化）
- Step3: `ocean_collision` / `oceanCurrent`（既存）

> 「最初にプレイスホルダ」要件：
> - `wind_belts` は最初は `wind` と同じ描画でもよい（modeだけ先に生やす）
> - 後続Unitで `wind_belts` を「境界線・ピーク線・doldrums」を含むデバッグ表示へ育てる

### 5.2 MapVisualizer（表示）
- `modeLabels` に Step2/3/4 の新番号を反映
- `PixelRenderer` に `wind_belts` モードを追加
  - 初期は `wind` と同じ色でもOK
  - 後で「beltIndex」「windU符号」「tradePeak距離」を色で見せる

### 5.3 OverlayRenderer（デバッグ線）
`wind_belts`（および必要なら `wind`）で以下を表示できるようにする：
- ITCZライン（displayMonthに同期）
- cell境界（cellBoundariesDeg を水平線で）
- tradePeakライン（ITCZ±tradePeakOffsetDeg を曲線で）
-（任意）doldrums帯（ITCZ±doldrumsHalfWidth を薄帯で）

※ `WindBeltsResult` を `SimulationResult.wind` に格納して参照する。
格納されていない場合はフォールバック（cellCount/90分割）で仮描画。

### 5.4 WindDebugView（風帯デバッグ）
OceanDebugViewのUI導線（フッターのボタン）に倣って追加：
- フッターに **「風帯デバッグ」ボタン**を追加
- `WindDebugView`（最初は空箱）を実装し、段階的に情報を増やす

**WindDebugViewで最低限出す値**
- `cellCount`, `hadleyWidth`, `hadleyEdgeDeg`
- `tradePeakOffsetDeg`, `oceanEcLatGapDerived`
- `windOceanEcGapMode` と実際に Step3 に渡された gap
- 月切替（annual/Jan/Jul）

---

## 6. 実装単位（小分け）＋申し送り要件（別担当可）

> 各Unit完了時に `docs/handover/UNIT_*.md` を必ず追加（テンプレは末尾）。
> **Unitを跨いで未完のTODOがある場合は、そのTODOを申し送りに必ず列挙する。**

### Unit A: Step番号再編 + UIにStep2(Wind)/Step3(Ocean)/Step4(Airflow)をプレイスホルダ追加
**目的**: “見える化”を先に作り、以後の改造を都度デバッグ可能にする。

- 変更:
  - `App.tsx` の `PIPELINE_STEPS` を新Step構成に変更
  - `MapVisualizer.tsx` の `modeLabels` の Step番号を更新
  - Step2に `wind`（既存）/ `wind_belts`（新規）を追加（まずはプレイスホルダ）
- 受入条件:
  - アプリ起動し、上部タブに Step2:Wind / Step3:Ocean / Step4:Airflow が表示される
  - `wind_belts` はこの時点では `wind` と同等表示でも良い（クラッシュしない）

**申し送り（必須）**: `docs/handover/UNIT_A_ui_pipeline_wind_placeholder.md`

---

### Unit B: Step2（computeWindBelts）枠を追加（まだ挙動は変えない）
**目的**: Step2の“計算場所”を先に確保し、以後の差分を小さくする。

- 追加:
  - `services/physics/windBelts.ts`（新規）
  - `computeWindBelts(...) => WindBeltsResult`
- 変更:
  - `runSimulation` に Step2呼び出しだけ追加
  - この段階では **gridへの書き込みはしない**（modelLevel='scaffold'を返すのみ）

**受入条件**:
- 結果が従来と同じ（Step0の固定風が残る）
- `result.wind` が存在し、WindDebugView（未実装でも）参照で落ちない

**申し送り（必須）**: `docs/handover/UNIT_B_step2_wind_stub.md`

---

### Unit C: Step0の固定風を撤去し、旧ロジックをStep2へ移植（結果を変えない）
**目的**: 風帯の責務をStep2に移し、UIでStep2を見てデバッグできる状態へ。

- 変更:
  - Step0初期化から「30/60閾値windU」埋めを削除（windU/V/pressureはニュートラル初期化のみ）
  - Step2で旧ロジックをそのまま実行し `grid.windU/V/pressure` を埋める
  - `WindBeltsResult.modelLevel='scaffold'`

**受入条件**:
- `wind`/`wind_belts` 表示が旧挙動と一致
- Step3海流の結果が大きく変わらない

**申し送り（必須）**: `docs/handover/UNIT_C_move_wind_from_step0_to_step2.md`

---

### Unit D: セル数に応じた風帯境界（cellBoundaries）を導入（まずはUだけ）
**目的**: 30/60固定を撤去し、セル数増減に追従する“帯”を作る。

- 追加（PhysicsParams）:
  - `windHadleyWidthScale`, `windJetSpacingExp`
  - `windBaseSpeedEasterly`, `windBaseSpeedWesterly`, `windSpeedRotationExp`
- Step2ロジック:
  - `hadleyEdgeDeg = circulationRes.hadleyWidth * windHadleyWidthScale`
  - `cellBoundariesDeg` を生成（等間隔ではなくexpで伸縮）
  - `abs(lat)` が属するベルトで U の符号/強度を決める

**受入条件**:
- `cellCount` を変えたとき `wind_belts` の帯が増減する
- `result.wind.cellBoundariesDeg` がUIに表示される

**申し送り（必須）**: `docs/handover/UNIT_D_generalize_belts_U.md`

---

### Unit E: 【追加要件】ITCZ中心の無風帯 + 貿易風ピーク（赤道海流を駆動する風）
**目的**: “赤道海流を駆動する風” をStep2に含め、海流に渡す gap を合理化する。

- 追加（PhysicsParams）:
  - `windDoldrumsWidthDeg`
  - `windTradePeakOffsetMode`, `windTradePeakOffsetDeg`, `windTradePeakOffsetFrac`
  - `windTradePeakWidthDeg`, `windTropicalUCap`
- Step2ロジック（tropics内のUをITCZ基準で変形）:
  - 各セルについて `itczLat = itczLines[m][lonIdx]`
  - `d = cell.lat - itczLat`
  - ITCZ近傍（|d|小）で windU を弱める（doldrums）
  - |d| ≈ tradePeakOffset で windU の絶対値が最大になるように形を作る
- 出力:
  - `doldrumsHalfWidthDeg`
  - `tradePeakOffsetDeg`

**受入条件**:
- `wind_belts` 上で ITCZ付近が弱風、両側に強風帯が見える
- `tradePeakOffsetDeg` が WindDebugView に表示される

**申し送り（必須）**: `docs/handover/UNIT_E_trade_winds_doldrums.md`

---

### Unit F: ITCZ収束V + 抽象気圧帯（pressure）をStep2に追加
**目的**: “風帯（U）だけ”から「低圧/高圧帯 + 収束（V）」へ拡張し、Step4の入力を整える。

- Step2ロジック:
  - ITCZ上：低圧（負のガウス）
  - 境界線：交互に高圧/低圧（正負ガウス）
  - windV：ITCZへ向かう収束（幅あり）

**受入条件**:
- `wind` 表示で pressure の帯が見える
- 逆行で windUは反転するが pressure は反転しない

**申し送り（必須）**: `docs/handover/UNIT_F_pressure_and_convergence_V.md`

---

### Unit G: Step2→Step3結合（gap派生）※海流ロジック改変禁止
**目的**: Step3が使う `phys.oceanEcLatGap` を、Step2の tradePeak から導出して渡す。

- 追加（PhysicsParams）:
  - `windOceanEcGapMode`, `windOceanEcGapClampMin`, `windOceanEcGapClampMax`
- `runSimulation` 変更:
  - `gap = (mode==='manual') ? phys.oceanEcLatGap : clamp(windRes.tradePeakOffsetDeg, min, max)`
  - `physForOcean = { ...phys, oceanEcLatGap: gap }`
  - `computeOceanCurrents(..., physForOcean, ...)`
- 禁止:
  - **`services/physics/ocean.ts` を編集しない**

**受入条件**:
- manual/derived の切替で sea current の分離幅が変わる
- derivedでもクラッシュしない（±90 clamp）

**申し送り（必須）**: `docs/handover/UNIT_G_ocean_gap_from_tradePeak.md`

---

### Unit H: UIデバッグ強化（Overlay + WindDebugViewを段階的に有効化）
**目的**: 各Unitの成果を“見て”確認できるようにする。

- `PixelRenderer`: `wind_belts` をデバッグ色へ
- `OverlayRenderer`: ITCZ/境界/ピーク線を `wind_belts` に描画
- `WindDebugView`: 数値 + 切替UI（annual/Jan/Jul）

**受入条件**:
- Unit D以降の `cellBoundaries` が線で見える
- Unit E以降の `tradePeakOffset` が線で見える

**申し送り（必須）**: `docs/handover/UNIT_H_ui_debug_windbelts.md`

---

### Unit I: Step4（詳細気流）入口だけ追加（stub）
**目的**: 将来の詳細気流を差し込むポイントだけ作る。

- 追加:
  - `services/physics/airflow.ts` に `computeAirflowDetailed(...)` を追加（中身空OK）
- 変更:
  - `runSimulation` の最後にStep4を追加（progress/stepId含む）

**受入条件**:
- Step4が何もしなくてもビルドが通り結果が変わらない

**申し送り（必須）**: `docs/handover/UNIT_I_step4_airflow_stub.md`

---

## 7. 申し送りテンプレ（全Unit共通）

`docs/handover/UNIT_*.md` に以下を必ず含める。

- 目的（このUnitで何ができるようになったか）
- 変更点（ファイル/関数/型/パラメータ）
- I/O（入力に何を期待し、何を出力/更新したか）
- 動作確認（再現手順、確認観点、可能ならスクショ）
- 既知の制限・次Unitへの宿題
- 触ってはいけない領域
  - **Step3海流ロジック（services/physics/ocean.ts）は改変禁止**

