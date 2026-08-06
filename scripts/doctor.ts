import { runEnvironmentDoctor } from '../packages/android-environment/src/index';
import { ensureAppDirectories, getAppMeta, resolveAppPaths } from '@twinby/config';

async function main(): Promise<void> {
  const paths = resolveAppPaths();
  ensureAppDirectories(paths);
  const report = await runEnvironmentDoctor();

  console.log(
    JSON.stringify(
      {
        stage: 5,
        app: getAppMeta(),
        paths: {
          data: paths.data,
          database: paths.database,
          logs: paths.logs,
        },
        report,
      },
      null,
      2,
    ),
  );

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
