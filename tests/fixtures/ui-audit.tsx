import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Clipboard from '../../src/Clipboard';
import CaptureDialog from '../../src/CaptureDialog';
import { starters } from '../../src/model';
import '../../src/styles.css';
import '../../src/redesign.css';
import '../../src/polish.css';
import '../../src/appearance.css';
import '../../src/journey.css';

// Development fixture only; realistic data enters through the production props.
const params = new URLSearchParams(location.search);
const worst = [
  {
    ...starters[0],
    id: 'long',
    name: 'Enterprise customer onboarding — permissions, team invitations and notification preferences',
    source:
      'https://example.com/workspaces/northwind-industries-holdings/projects/customer-onboarding/components/notification-preferences?version=reviewed',
  },
  {
    ...starters[0],
    id: 'email',
    name: 'bartholomew.fitzgerald@northwind-industries-holdings.example.com',
  },
  { ...starters[0], id: 'short', name: 'J' },
  { ...starters[0], id: 'cjk', name: '客户工作空间与通知偏好设置' },
  { ...starters[0], id: 'rtl', name: 'إعدادات مساحة العمل والإشعارات' },
  {
    ...starters[0],
    id: 'emoji',
    name: '👩🏽‍💻 Đặng Thị Ngọc Hân — Paramètres de confidentialité et de sécurité',
  },
];
function Fixture() {
  const [mode, setMode] = useState(params.get('data') || 'demo'),
    [open, setOpen] = useState(false),
    [opened, setOpened] = useState('');
  const items =
    mode === 'worst'
      ? worst
      : mode === 'empty'
        ? []
        : mode === 'one'
          ? [worst[0]]
          : mode === 'large'
            ? Array.from({ length: 200 }, (_, i) => ({
                ...worst[i % worst.length],
                id: 'row-' + i,
                name: `${i + 1}. ${worst[i % worst.length].name}`,
              }))
            : starters;
  document.documentElement.dataset.appearance = params.get('appearance') || 'dark';
  return (
    <>
      <nav
        aria-label="Fixture data"
        style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: 12 }}
      >
        {['demo', 'worst', 'empty', 'one', 'large'].map((value) => (
          <button
            key={value}
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              history.replaceState(
                null,
                '',
                '?' + new URLSearchParams({ ...Object.fromEntries(params), data: value }),
              );
            }}
          >
            {value === 'demo' ? 'Demo data' : value === 'worst' ? 'Worst case' : value}
          </button>
        ))}
      </nav>
      <main
        className="ui-workspace"
        dir={params.get('dir') || 'ltr'}
        style={{ padding: 12, fontSize: params.has('largeText') ? '200%' : undefined }}
      >
        <Clipboard
          full
          items={items}
          onOpen={(item) => setOpened(item.name)}
          onDelete={() => {}}
          onIntegrate={(item) => setOpened('Install ' + item.name)}
        />
        <output aria-label="Selected component">{opened}</output>
        <button onClick={() => setOpen(true)}>Test capture</button>
        {open && (
          <CaptureDialog
            initialTab="html"
            onClose={() => setOpen(false)}
            onCapture={() => setOpened('Captured')}
            onImport={() => {}}
          />
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
