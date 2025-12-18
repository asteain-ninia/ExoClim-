
# Handover Note: Unit G/H/I - Step Coupling & Airflow Stub

## 完了内容
- **Unit G**: `climateEngine.ts` を更新し、Step 2 で算出された `oceanEcLatGapDerived` を Step 3 の海流計算に渡すように結合。これにより風と海流の物理的整合性が取れるようになった。
- **Unit H**: `WindDebugView` コンポーネントを実装し、フッターから風帯の計算結果（セル境界、貿易風オフセット等）を確認可能にした。
- **Unit I**: `services/physics/airflow.ts` を新規作成し、Step 4 (気流詳細) のスタブをパイプラインに挿入。

## 変更ファイル
- `services/physics/airflow.ts`: 新規作成 (Stub)。
- `services/climateEngine.ts`: Step 3 結合ロジック、Step 4 呼び出し追加。
- `components/WindDebugView.tsx`: 新規作成。
- `App.tsx`: デバッグビューのトグル追加。

## 次のステップ (Step 5: Thermodynamics) への申し送り
- これで大気・海流の「動き」の土台が整いました。次は **Step 5: 熱力学 (services/physics/thermodynamics.ts)** の実装が必要です。
- 日射量 (`calculateInsolation`) と、大気輸送・海洋輸送を考慮した温度分布の算出を再実装してください。
- 帯状平均温度だけでなく、海流の暖流・寒流が沿岸の気温に与える影響を組み込むのが目標です。
