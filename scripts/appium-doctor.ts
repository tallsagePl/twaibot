import { runAppiumDoctorSubset } from '../packages/android-environment/src/index';

async function main(): Promise<void> {
  const report = await runAppiumDoctorSubset();
  console.log(JSON.stringify({ stage: 5, report }, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
