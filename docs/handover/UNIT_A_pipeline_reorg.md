
# Handover Note: Unit A - Pipeline Reorganization

## 完了内容
- シミュレーションのパイプラインを 4 ステップ（ITCZ -> Wind -> Ocean -> Airflow）に再編。
- `App.tsx` のナビゲーションタブおよび `MapVisualizer.tsx` のラベルを新ステップに追従。
- `climateEngine.ts` に各ステップの進捗報告（onProgress）と placeholder を追加。
- `wind_belts` モードを UI に追加（現在は `wind` と同じ描画）。

## 変更ファイル
- `App.tsx`
- `MapVisualizer.tsx`
- `services/climateEngine.ts`
- `components/visualizer/PixelRenderer.ts`
- `components/visualizer/Legend.tsx`

## 次のステップ (Unit B/C) への申し送り
- `services/physics/windBelts.ts` を新規作成し、`runSimulation` 内の初期化ループにある風のロジックを移動する。
- `types.ts` に `WindBeltsResult` を追加し、計算結果を UI で参照可能にする。
- **重要**: `services/physics/ocean.ts` の内部ロジックは変更禁止。
