import { useState } from 'react';
import { useUiStore } from '../app/store';
import eurydiceLogo from '../assets/eurydice-logo.png';

export function WelcomePage() {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acceptConsent = useUiStore((s) => s.acceptConsent);

  async function onContinue() {
    if (!checked) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptConsent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить согласие');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome__panel">
        <div className="welcome__brand">
          <img src={eurydiceLogo} alt="Orpheus & Eurydice" width={72} height={72} />
          <p className="eyebrow">Orpheus &amp; Eurydice</p>
        </div>
        <h1>Двусторонняя оптимизация знакомств</h1>
        <p className="lede">
          Eurydice помогает выбирать анкеты в Twinby. Orpheus помогает честно представить
          себя выбранной аудитории. Локальное Windows-приложение через Appium — не
          официальный продукт Twinby.
        </p>

        <div className="notice">
          <h2>Важное предупреждение</h2>
          <p>
            Twinby в пользовательском соглашении запрещает программы автоматизации,
            несанкционированное ПО и несанкционированные соединения. Использование
            может привести к ограничению функций или удалению аккаунта.
          </p>
          <a
            href="https://twinby.ru/legal/user-agreement"
            target="_blank"
            rel="noreferrer"
          >
            Открыть пользовательское соглашение Twinby
          </a>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>
            Я понимаю, что автоматизация может нарушать правила Twinby, может привести
            к ограничению функций или удалению аккаунта. Я запускаю приложение на
            собственном аккаунте и принимаю риск.
          </span>
        </label>

        {error && <p className="error">{error}</p>}

        <button
          type="button"
          className="btn btn--primary"
          disabled={!checked || busy}
          onClick={() => void onContinue()}
        >
          {busy ? 'Сохранение…' : 'Продолжить'}
        </button>
      </div>
    </div>
  );
}
