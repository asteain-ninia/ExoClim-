
# Handover Note: Unit B/C - Wind Service Migration

## 完了内容
- 風帯の計算を `services/physics/windBelts.ts` へ完全移行。
- `climateEngine.ts` の Step 0 からハードコードされた風の初期化を削除し、Step 2 で実行するように変更。
- `WindBeltsResult` 型を導入し、`SimulationResult` に格納。
- `PhysicsParams` に将来の風帯チューニング用パラメータを追加（デフォルト値設定済み）。

## 変更ファイル
- `types.ts`: `WindBeltsResult` 追加、`PhysicsParams` 拡張。
- `constants.ts`: デフォルトパラメータ追加。
- `services/physics/windBelts.ts`: 新規作成、ロジック移植。
- `services/climateEngine.ts`: Step 0 クリーンアップ、Step 2 呼び出し実装。

## 次のステップ (Unit D) への申し送り
- 30/60 度の固定閾値を廃止し、`circulationRes.cellCount` に基づく動的な帯状境界（`cellBoundariesDeg`）を実装する。
- `windHadleyWidthScale` や `windJetSpacingExp` を用いて、惑星の自転速度や半径に応じたベルトの伸縮を表現する。
- **重要**: `ocean.ts` は依然として改変禁止領域。
