import { listMockProfiles, getFixturesRoot } from '../packages/test-fixtures/src/index';

const profiles = listMockProfiles();
console.log(`Fixtures root: ${getFixturesRoot()}`);
console.log(`Profiles: ${profiles.length}`);
for (const profile of profiles) {
  console.log(
    `- ${profile.id}: age=${profile.age}, photos=${profile.photoPaths.length}, goal=${profile.goal}`,
  );
}
console.log('');
console.log('Для полного mock-прогона с ИИ:');
console.log('1. pnpm dev');
console.log('2. Задайте API-ключ в «ИИ»');
console.log('3. (опционально) проанализируйте референсы');
console.log('4. Откройте «Сессия» → «Запустить mock»');
