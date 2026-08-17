import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Keycloak from 'keycloak-js';
import './styles.css';

const brand = import.meta.env.VITE_BRAND_NAME || 'My AI Desk';
const primary = import.meta.env.VITE_BRAND_PRIMARY || '#635BFF';
const baseDomain = import.meta.env.VITE_BASE_DOMAIN || 'example.com';
const publicScheme = import.meta.env.VITE_PUBLIC_SCHEME || 'https';
const publicPortSuffix = import.meta.env.VITE_PUBLIC_PORT_SUFFIX || '';
const serviceUrl = (subdomain) => `${publicScheme}://${subdomain}.${baseDomain}${publicPortSuffix}`;
const apiBase = import.meta.env.VITE_API_URL || serviceUrl('api');
const typebotSsoMarker = 'unified-typebot-sso-ready';

const keycloak = new Keycloak({
  url: serviceUrl('auth'),
  realm: 'unified',
  clientId: 'unified-dashboard',
});

const services = {
  overview: {
    label: 'نظرة عامة',
    description: 'إدارة العملاء ومساحات العمل من منصتك الموحدة',
    icon: '⌂',
    native: true,
  },
  inbox: {
    label: 'صندوق المحادثات',
    description: 'WhatsApp وInstagram وباقي القنوات',
    url: serviceUrl('inbox'),
    icon: '◈',
  },
  flows: {
    label: 'مسارات الأتمتة',
    description: 'بناء وتعديل تدفقات المحادثة والذكاء الاصطناعي',
    url: serviceUrl('flows'),
    icon: '⌘',
  },
};

async function apiRequest(path, options = {}) {
  await keycloak.updateToken(30);
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${keycloak.token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json();
}

function Overview() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest('/v1/tenants');
      setTenants(response.data);
    } catch {
      setError('تعذر تحميل مساحات العمل. تحقق من حالة خدمة التحكم المركزية.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createTenant = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest('/v1/tenants', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      await load();
    } catch {
      setError('تعذر إنشاء مساحة العمل. تأكد من أن الاسم غير مستخدم.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="native-page">
      <div className="stats-grid">
        <article className="stat-card"><span>مساحات العمل</span><strong>{tenants.length}</strong><small>عملاء معزولون داخل المنصة</small></article>
        <article className="stat-card"><span>مصدر البيانات</span><strong>موحّد</strong><small>جهات الاتصال والأتمتة تحت إدارة منصتك</small></article>
        <article className="stat-card"><span>المحركات</span><strong>2</strong><small>Chatwoot للمحادثات وTypebot للتدفقات</small></article>
      </div>

      <div className="tenant-panel">
        <div className="panel-title"><div><h2>مساحات عمل العملاء</h2><p>كل مساحة تعزل البيانات والقنوات والأتمتة عن بقية العملاء.</p></div></div>
        <form className="tenant-form" onSubmit={createTenant}>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="اسم العميل أو الشركة" maxLength="120" />
          <button disabled={saving}>{saving ? 'جارٍ الإنشاء…' : 'إضافة مساحة عمل'}</button>
        </form>
        {error && <div className="inline-error">{error}</div>}
        {loading ? <div className="list-state"><div className="spinner" />جارٍ تحميل العملاء…</div> : (
          <div className="tenant-list">
            {tenants.length === 0 && <div className="empty-state">لم تُضف أي مساحة عمل بعد. ابدأ بإضافة أول عميل.</div>}
            {tenants.map((tenant) => (
              <article className="tenant-row" key={tenant.id}>
                <span className="tenant-mark">{tenant.name.slice(0, 1).toUpperCase()}</span>
                <div><strong>{tenant.name}</strong><small>{tenant.slug} · {tenant.timezone}</small></div>
                <span className={`status ${tenant.status}`}>{tenant.status === 'active' ? 'نشط' : tenant.status}</span>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function App() {
  const initial = new URLSearchParams(location.search).get('service');
  const [active, setActive] = useState(services[initial] ? initial : 'overview');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [loadingFrame, setLoadingFrame] = useState(true);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary', primary);
    document.title = brand;
    keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
      .then((authenticated) => {
        if (!authenticated) return keycloak.login();
        const ssoResult = new URLSearchParams(location.search).get('sso');
        if (ssoResult === 'typebot') {
          sessionStorage.setItem(typebotSsoMarker, 'true');
          history.replaceState({}, '', '/');
          setReady(true);
          return undefined;
        }
        if (ssoResult === 'typebot-error') {
          sessionStorage.setItem(typebotSsoMarker, 'error');
          history.replaceState({}, '', '/');
          setReady(true);
          return undefined;
        }
        if (!sessionStorage.getItem(typebotSsoMarker)) {
          const returnUrl = `${location.origin}/?sso=typebot`;
          location.replace(`${serviceUrl('flows')}/sso/typebot.html?return=${encodeURIComponent(returnUrl)}`);
          return undefined;
        }
        setReady(true);
        return undefined;
      })
      .catch(() => setError('تعذر الاتصال بخدمة تسجيل الدخول. تحقق من DNS وحالة Keycloak.'));
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const timer = setInterval(() => keycloak.updateToken(60).catch(() => keycloak.login()), 30000);
    return () => clearInterval(timer);
  }, [ready]);

  const user = useMemo(() => keycloak.tokenParsed || {}, [ready]);
  const service = services[active];
  const selectService = (key) => {
    setActive(key);
    setLoadingFrame(true);
    history.replaceState({}, '', `?service=${key}`);
  };

  if (error) return <main className="center-state"><div className="error-card">{error}</div></main>;
  if (!ready) return <main className="center-state"><div className="spinner"/><p>جارٍ تسجيل الدخول…</p></main>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">◆</span><strong>{brand}</strong></div>
        <nav>
          {Object.entries(services).map(([key, item]) => (
            <button key={key} className={active === key ? 'nav-item active' : 'nav-item'} onClick={() => selectService(key)}>
              <span className="nav-icon">{item.icon}</span>
              <span><b>{item.label}</b><small>{item.description}</small></span>
            </button>
          ))}
        </nav>
        <div className="profile">
          <span className="avatar">{(user.name || user.preferred_username || 'U').slice(0, 1).toUpperCase()}</span>
          <span className="profile-copy"><b>{user.name || user.preferred_username}</b><small>{user.email}</small></span>
          <button className="logout" title="تسجيل الخروج" onClick={() => keycloak.logout({ redirectUri: location.origin })}>↪</button>
        </div>
      </aside>

      <main className="workspace">
        <header>
          <div><h1>{service.label}</h1><p>{service.description}</p></div>
          {!service.native && <a className="open-new" href={service.url} target="_blank" rel="noreferrer">فتح في نافذة مستقلة ↗</a>}
        </header>
        {service.native ? <Overview /> : (
          <section className="frame-wrap">
            {loadingFrame && <div className="frame-loading"><div className="spinner"/><span>جارٍ تحميل النظام…</span></div>}
            <iframe key={active} title={service.label} src={service.url}
              allow="clipboard-read; clipboard-write; fullscreen" onLoad={() => setLoadingFrame(false)} />
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
