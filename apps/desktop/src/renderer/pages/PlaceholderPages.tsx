function Placeholder({
  title,
  description,
  stage,
}: {
  title: string;
  description: string;
  stage: string;
}) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <p className="lede">{description}</p>
      <div className="card-lite">
        <p>
          Экран подготовлен. Реализация — <strong>{stage}</strong>.
        </p>
      </div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <Placeholder
      title="Приватность и данные"
      description="Очистка temp-фото, retention, путь к данным, удаление истории."
      stage="постепенно"
    />
  );
}
