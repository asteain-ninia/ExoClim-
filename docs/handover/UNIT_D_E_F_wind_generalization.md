
# Handover Note: Unit D/E/F - Wind Generalization & Trade Winds

## 完了内容
- **Unit D**: 30/60度の固定閾値を廃止し、`cellCount` に基づく動的な帯状境界（`cellBoundariesDeg`）を実装。自転速度に応じた風速スケーリングを追加。
- **Unit E**: ITCZ基準の熱帯風モデルを実装。ITCZ直下の無風帯（Doldrums）と、その両側の貿易風ピーク（Trade Peaks）をシミュレート。
- **Unit F**: ITCZへの南北収束（Wind V）と、各循環境界における抽象的な気圧帯（Pressure Belts）を実装。
- **Unit H (一部)**: `OverlayRenderer` を更新し、`wind_belts` モードでセル境界と貿易風ピークを表示可能にした。

## 変更ファイル
- `services/physics/windBelts.ts`: 大幅アップデート。
- `components/visualizer/OverlayRenderer.ts`: デバッグ表示追加。

## 次のステップ (Unit G) への申し送り
- `runSimulation` (`services/climateEngine.ts`) を更新し、Step 2 で算出された `oceanEcLatGapDerived` を Step 3 の海流計算に渡すようにする。
- これにより、風の貿易風ピーク位置と海流の分岐位置が自動的に整合するようになる。
- **重要**: `services/physics/ocean.ts` の内部ロジックは絶対に変更しないこと。パラメータの上書きのみで対応する。
