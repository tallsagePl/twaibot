import { describe, expect, it } from 'vitest';
import { detectScreenFromPageSource } from './screen-detector';

describe('detectScreenFromPageSource — nav screens', () => {
  it('detects chats from Новые пары + Чаты', () => {
    const xml = `
      <node resource-id="navigationBar-Chat"/>
      <node text="Новые пары"/>
      <node text="Чаты"/>
      <node text="Алина"/>
    `;
    expect(detectScreenFromPageSource(xml).type).toBe('chats');
  });

  it('detects matches-list', () => {
    const xml = `
      <node content-desc="Новые пары"/>
      <node content-desc="Ранее&#10;Алина&#10;85%&#10;33 км" clickable="true"/>
    `;
    expect(detectScreenFromPageSource(xml).type).toBe('matches-list');
  });

  it('detects own-profile-edit', () => {
    const xml = `
      <node text="Мои фото"/>
      <node text="Заполнен на 56%"/>
      <node text="Перетащите, чтобы изменить порядок"/>
      <node text="Био"/>
    `;
    expect(detectScreenFromPageSource(xml).type).toBe('own-profile-edit');
  });

  it('still detects feed', () => {
    const xml = `
      <node resource-id="profileFeed-ProfileCard"/>
      <node resource-id="profileFeed-Button-Like"/>
    `;
    expect(detectScreenFromPageSource(xml).type).toBe('feed');
  });
});
