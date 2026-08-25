import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Keycloak from 'keycloak-js';
import './styles.css';
import { apiErrorMessage } from './api-errors.js';
import { readMetaOAuthCallback, scheduleDelayed } from './async-ui.js';
import { shouldLoadEmbeddedFrame } from './frame-loading.js';
import { shouldShowTenantBar } from './layout.js';
import { Icon } from './icons.jsx';

const brand = import.meta.env.VITE_BRAND_NAME || 'My AI Desk';
const primary = import.meta.env.VITE_BRAND_PRIMARY || '#635BFF';
const baseDomain = import.meta.env.VITE_BASE_DOMAIN || 'example.com';
const publicScheme = import.meta.env.VITE_PUBLIC_SCHEME || 'https';
const publicPortSuffix = import.meta.env.VITE_PUBLIC_PORT_SUFFIX || '';
const serviceUrl = (subdomain) => `${publicScheme}://${subdomain}.${baseDomain}${publicPortSuffix}`;
const apiBase = import.meta.env.VITE_API_URL || serviceUrl('api');

const keycloak = new Keycloak({
  url: serviceUrl('auth'),
  realm: 'unified',
  clientId: 'unified-dashboard',
});

const services = {
  overview: {
    label: 'نظرة عامة',
    description: 'الشركات التي يديرها فريقك',
    group: 'الإدارة',
    native: true,
  },
  employees: {
    label: 'الموظفون والصلاحيات',
    description: 'إنشاء حسابات الموظفين وتعيين الشركات والصلاحيات',
    group: 'الإدارة',
    native: true,
    adminOnly: true,
  },
  contacts: {
    label: 'العملاء',
    description: 'بيانات العملاء وحساباتهم عبر القنوات',
    group: 'بيانات الشركة',
    native: true,
  },
  products: {
    label: 'كتالوج المنتجات',
    description: 'إدارة المنتجات والأسعار والمخزون',
    group: 'بيانات الشركة',
    native: true,
  },
  knowledge: {
    label: 'معلومات الشركة',
    description: 'المعلومات التي يعتمد عليها المساعد في الإجابات',
    group: 'بيانات الشركة',
    native: true,
  },
  ai: {
    label: 'المساعد الذكي',
    description: 'أسلوب الإجابة والتحويل إلى الموظفين',
    group: 'بيانات الشركة',
    native: true,
  },
  rules: {
    label: 'قواعد الاستجابة',
    description: 'تشغيل رد أو تحويل عند ورود كلمات محددة',
    group: 'التشغيل',
    native: true,
  },
  channels: {
    label: 'الحسابات والقنوات',
    description: 'إضافة حسابات التواصل وإدارة اتصالها',
    group: 'التشغيل',
    native: true,
  },
  inbox: {
    label: 'صندوق المحادثات',
    description: 'متابعة رسائل العملاء وتوزيعها على الفريق',
    url: serviceUrl('inbox'),
    group: 'التشغيل',
  },
  flows: {
    label: 'منشئ التدفقات',
    description: 'تصميم الردود الآلية ومسارات المحادثة',
    url: serviceUrl('flows'),
    group: 'التشغيل',
  },
};

const navigationGroups = ['الإدارة', 'بيانات الشركة', 'التشغيل'];
const FRAME_LOADING_LIMIT_MS = 12000;

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
  if (response.status === 204) return null;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(apiErrorMessage(body.error, response.status));
  }
  return response.json();
}

function logoutEngine(engine, origin) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      frame.remove();
      resolve();
    };
    const onMessage = (event) => {
      if (event.origin === origin && event.data?.type === 'my-ai-desk-engine-logout' && event.data?.engine === engine) cleanup();
    };
    window.addEventListener('message', onMessage);
    frame.src = `${origin}/sso/${engine}-logout.html`;
    document.body.appendChild(frame);
    setTimeout(cleanup, 4000);
  });
}

function TenantBar({ tenants, selectedId, onSelect }) {
  if (!tenants || tenants.length === 0) return null;
  return (
    <div className="tenant-select-bar">
      <label>مساحة العمل الحالية:</label>
      <select value={selectedId || ''} onChange={(e) => onSelect(e.target.value)}>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
        ))}
      </select>
    </div>
  );
}

function Overview({ tenants, onRefresh, isAdmin }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const createTenant = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest('/v1/tenants', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      if (onRefresh) await onRefresh();
    } catch (err) {
      setError(err.message || 'تعذر إنشاء مساحة العمل. تأكد من أن الاسم غير مستخدم.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="native-page">
      <div className="stats-grid">
        <article className="stat-card"><span>مساحات العمل</span><strong>{tenants.length}</strong><small>عملاء معزولون داخل المنصة</small></article>
        <article className="stat-card"><span>بيانات الشركات</span><strong>منفصلة</strong><small>منتجات وعملاء ومعلومات مستقلة لكل شركة</small></article>
        <article className="stat-card"><span>الخدمة</span><strong>مستمرة</strong><small>الردود تعمل حتى عند إغلاق التطبيق</small></article>
      </div>

      <div className="tenant-panel">
        <div className="panel-title"><div><h2>مساحات عمل العملاء</h2><p>كل مساحة تعزل البيانات والقنوات والأتمتة عن بقية العملاء.</p></div></div>
        {isAdmin && (
          <form className="tenant-form" onSubmit={createTenant}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم العميل أو الشركة" maxLength="120" />
            <button disabled={saving}>{saving ? 'جارٍ الإنشاء…' : 'إضافة مساحة عمل'}</button>
          </form>
        )}
        {error && <div className="inline-error">{error}</div>}
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
      </div>
    </section>
  );
}

function EmployeesView({ tenants, currentSubject }) {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', displayName: '', temporaryPassword: '' });
  const [assignment, setAssignment] = useState({ operatorId: '', tenantId: '', role: 'operator' });

  const loadOperators = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest('/v1/operators');
      setOperators(response.data || []);
    } catch (err) {
      setError(err.message || 'تعذر تحميل الموظفين.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOperators(); }, []);

  const createEmployee = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiRequest('/v1/operators', { method: 'POST', body: JSON.stringify(form) });
      setForm({ email: '', displayName: '', temporaryPassword: '' });
      await loadOperators();
    } catch (err) {
      setError(err.message || 'تعذر إنشاء حساب الموظف.');
    } finally {
      setSaving(false);
    }
  };

  const saveAssignment = async (event) => {
    event.preventDefault();
    if (!assignment.operatorId || !assignment.tenantId) return;
    setSaving(true);
    setError('');
    try {
      await apiRequest(`/v1/operators/${assignment.operatorId}/memberships/${assignment.tenantId}`, {
        method: 'PUT', body: JSON.stringify({ roles: [assignment.role] }),
      });
      await loadOperators();
    } catch (err) {
      setError(err.message || 'تعذر حفظ تعيين الشركة.');
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (operatorId, tenantId) => {
    setError('');
    try {
      await apiRequest(`/v1/operators/${operatorId}/memberships/${tenantId}`, { method: 'DELETE' });
      await loadOperators();
    } catch (err) {
      setError(err.message || 'تعذر إلغاء التعيين.');
    }
  };

  const toggleStatus = async (operator) => {
    setError('');
    const status = operator.status === 'active' ? 'suspended' : 'active';
    try {
      await apiRequest(`/v1/operators/${operator.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadOperators();
    } catch (err) {
      setError(err.message || 'تعذر تغيير حالة الموظف.');
    }
  };

  return (
    <section className="native-page">
      <div className="data-card">
        <div className="panel-title"><h2>إنشاء حساب موظف</h2><p>سيُطلب من الموظف تغيير كلمة المرور المؤقتة عند أول دخول.</p></div>
        <form className="form-card" onSubmit={createEmployee}>
          <div className="form-grid">
            <div className="form-group"><label>الاسم</label><input required minLength="2" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></div>
            <div className="form-group"><label>البريد الإلكتروني</label><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="form-group"><label>كلمة مرور مؤقتة</label><input required type="password" minLength="12" value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} /></div>
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'إنشاء الموظف'}</button>
        </form>

        <div className="panel-title"><h2>تعيين شركة لموظف</h2><p>يمكن تعيين الموظف نفسه لأكثر من شركة.</p></div>
        <form className="form-card assignment-form" onSubmit={saveAssignment}>
          <div className="form-grid">
            <div className="form-group"><label>الموظف</label><select required value={assignment.operatorId} onChange={(e) => setAssignment({ ...assignment, operatorId: e.target.value })}><option value="">اختر موظفًا</option>{operators.filter((o) => o.oidc_subject !== currentSubject).map((o) => <option key={o.id} value={o.id}>{o.display_name} · {o.email}</option>)}</select></div>
            <div className="form-group"><label>الشركة</label><select required value={assignment.tenantId} onChange={(e) => setAssignment({ ...assignment, tenantId: e.target.value })}><option value="">اختر شركة</option>{tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div className="form-group"><label>الدور</label><select value={assignment.role} onChange={(e) => setAssignment({ ...assignment, role: e.target.value })}><option value="operator">إدارة المحادثات والمحتوى</option><option value="automation-editor">تحرير الأتمتة</option><option value="tenant-admin">إدارة مساحة الشركة</option></select></div>
          </div>
          <button className="btn-primary" disabled={saving}>حفظ التعيين</button>
        </form>

        {error && <div className="inline-error">{error}</div>}
        {loading ? <div className="list-state"><div className="spinner" />جارٍ تحميل الموظفين…</div> : (
          <table className="data-table">
            <thead><tr><th>الموظف</th><th>الحالة</th><th>الشركات المعيّنة</th><th>إجراءات</th></tr></thead>
            <tbody>
              {operators.length === 0 && <tr><td colSpan="4" className="empty-state">لا توجد حسابات بعد.</td></tr>}
              {operators.map((operator) => (
                <tr key={operator.id}>
                  <td><strong>{operator.display_name}</strong><br/><small>{operator.email}</small></td>
                  <td><span className={`badge ${operator.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{operator.status === 'active' ? 'نشط' : 'موقوف'}</span></td>
                  <td><div className="membership-list">{(operator.memberships || []).length === 0 ? <small>دون شركات</small> : operator.memberships.map((m) => <span className="membership-chip" key={m.tenantId}>{m.tenantName}<button type="button" title="إلغاء التعيين" onClick={() => removeAssignment(operator.id, m.tenantId)}>×</button></span>)}</div></td>
                  <td>{operator.oidc_subject === currentSubject ? <small>حسابك الإداري</small> : <button type="button" className={operator.status === 'active' ? 'btn-danger' : 'btn-secondary'} onClick={() => toggleStatus(operator)}>{operator.status === 'active' ? 'إيقاف' : 'تفعيل'}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function ContactsView({ tenantId }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ displayName: '', email: '', phone: '', provider: 'instagram', externalId: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  const loadContacts = async (signal) => {
    if (!tenantId) return;
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const res = await apiRequest(`/v1/tenants/${tenantId}/contacts?search=${encodeURIComponent(search)}`, { signal });
      if (version === requestVersion.current) setContacts(res.data || []);
    } catch (err) {
      if (err.name !== 'AbortError' && version === requestVersion.current) setError(err.message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!tenantId) return undefined;
    const controller = new AbortController();
    const cancel = scheduleDelayed(() => loadContacts(controller.signal));
    return () => {
      cancel();
      controller.abort();
    };
  }, [tenantId, search]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.displayName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        displayName: form.displayName,
        email: form.email || null,
        phone: form.phone || null,
        identity: form.externalId ? { provider: form.provider, externalId: form.externalId } : undefined,
      };
      await apiRequest(`/v1/tenants/${tenantId}/contacts`, { method: 'POST', body: JSON.stringify(payload) });
      setForm({ displayName: '', email: '', phone: '', provider: 'instagram', externalId: '' });
      setShowAdd(false);
      await loadContacts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="native-page">
      <div className="toolbar">
        <input className="search-input" placeholder="بحث باسم العميل، البريد، أو الهاتف…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'إلغاء' : '+ إضافة جهة اتصال'}</button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      {showAdd && (
        <form className="form-card" onSubmit={handleAdd}>
          <h3>إضافة جهة اتصال جديدة</h3>
          <div className="form-grid">
            <div className="form-group"><label>الاسم الكامل</label><input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="مثال: أحمد محمد" /></div>
            <div className="form-group"><label>البريد الإلكتروني</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" /></div>
            <div className="form-group"><label>رقم الهاتف</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+966500000000" /></div>
            <div className="form-group">
              <label>قناة التفاعل</label>
              <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="messenger">Messenger</option>
                <option value="telegram">Telegram</option>
              </select>
            </div>
            <div className="form-group"><label>المعرف الخارجي بالقناة</label><input value={form.externalId} onChange={(e) => setForm({ ...form, externalId: e.target.value })} placeholder="External User ID" /></div>
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ جهة الاتصال'}</button>
        </form>
      )}

      <div className="data-card">
        {loading ? <div className="list-state"><div className="spinner" />جارٍ تحميل جهات الاتصال…</div> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>البريد الإلكتروني</th>
                <th>رقم الهاتف</th>
                <th>الهويات المربوطة</th>
                <th>تاريخ التحديث</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 && <tr><td colSpan="5" className="empty-state">لا توجد جهات اتصال مسجلة لمساحة العمل هذه.</td></tr>}
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.display_name}</strong></td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>
                    {c.identities && c.identities.length > 0 ? c.identities.map((id, idx) => (
                      <span key={idx} className="badge badge-blue">{id.provider}: {id.external_id}</span>
                    )) : <span className="badge badge-gray">لا توجد</span>}
                  </td>
                  <td>{new Date(c.updated_at).toLocaleDateString('ar-EG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function ProductsView({ tenantId }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', price: '0', currency: 'USD', inventoryQuantity: '10', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);

  const loadProducts = async (signal) => {
    if (!tenantId) return;
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const res = await apiRequest(`/v1/tenants/${tenantId}/products?search=${encodeURIComponent(search)}`, { signal });
      if (version === requestVersion.current) setProducts(res.data || []);
    } catch (err) {
      if (err.name !== 'AbortError' && version === requestVersion.current) setError(err.message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!tenantId) return undefined;
    const controller = new AbortController();
    const cancel = scheduleDelayed(() => loadProducts(controller.signal));
    return () => {
      cancel();
      controller.abort();
    };
  }, [tenantId, search]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        sku: form.sku || null,
        priceMinor: Math.round(parseFloat(form.price || '0') * 100),
        currency: form.currency,
        inventoryQuantity: parseInt(form.inventoryQuantity || '0', 10),
        description: form.description,
      };
      await apiRequest(`/v1/tenants/${tenantId}/products`, { method: 'POST', body: JSON.stringify(payload) });
      setForm({ name: '', sku: '', price: '0', currency: 'USD', inventoryQuantity: '10', description: '' });
      setShowAdd(false);
      await loadProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const archiveProduct = async (productId) => {
    try {
      await apiRequest(`/v1/tenants/${tenantId}/products/${productId}`, { method: 'DELETE' });
      await loadProducts();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="native-page">
      <div className="toolbar">
        <input className="search-input" placeholder="بحث بالاسم أو الـ SKU أو الوصف…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'إلغاء' : '+ إضافة منتج'}</button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      {showAdd && (
        <form className="form-card" onSubmit={handleAdd}>
          <h3>إضافة منتج جديد للكتالوج</h3>
          <div className="form-grid">
            <div className="form-group"><label>اسم المنتج</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: اشتراك شهر" /></div>
            <div className="form-group"><label>رمز SKU</label><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="PROD-001" /></div>
            <div className="form-group"><label>السعر</label><input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div className="form-group">
              <label>العملة</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="USD">USD ($)</option>
                <option value="SAR">SAR (ر.س)</option>
                <option value="EGP">EGP (ج.م)</option>
                <option value="AED">AED (د.إ)</option>
              </select>
            </div>
            <div className="form-group"><label>الكمية بالمخزون</label><input type="number" value={form.inventoryQuantity} onChange={(e) => setForm({ ...form, inventoryQuantity: e.target.value })} /></div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>الوصف</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows="2" placeholder="وصف المنتج والخدمة…" /></div>
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ المنتج'}</button>
        </form>
      )}

      <div className="data-card">
        {loading ? <div className="list-state"><div className="spinner" />جارٍ تحميل المنتجات…</div> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>SKU</th>
                <th>السعر</th>
                <th>المخزون</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && <tr><td colSpan="6" className="empty-state">لا توجد منتجات بالكتالوج بعد.</td></tr>}
              {products.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong><br /><small style={{ color: 'var(--muted)' }}>{p.description}</small></td>
                  <td>{p.sku || '—'}</td>
                  <td><strong>{(p.price_minor / 100).toFixed(2)} {p.currency}</strong></td>
                  <td>{p.inventory_quantity ?? 'غير محدد'}</td>
                  <td><span className={`badge ${p.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{p.status === 'active' ? 'نشط' : p.status}</span></td>
                  <td>
                    {p.status !== 'archived' && (
                      <button className="btn-danger" onClick={() => archiveProduct(p.id)}>أرشفة</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function KnowledgeView({ tenantId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', sourceKind: 'text', sourceUri: '', content: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadDocs = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/v1/tenants/${tenantId}/knowledge`);
      setDocs(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDocs(); }, [tenantId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        sourceKind: form.sourceKind,
        sourceUri: form.sourceKind === 'url' ? form.sourceUri : null,
        content: form.content,
      };
      const created = await apiRequest(`/v1/tenants/${tenantId}/knowledge`, { method: 'POST', body: JSON.stringify(payload) });
      if (created.data?.id) {
        await apiRequest(`/v1/tenants/${tenantId}/ai/documents/${created.data.id}/chunk`, { method: 'POST' });
      }
      setForm({ title: '', sourceKind: 'text', sourceUri: '', content: '' });
      setShowAdd(false);
      await loadDocs();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const archiveDoc = async (docId) => {
    try {
      await apiRequest(`/v1/tenants/${tenantId}/knowledge/${docId}`, { method: 'DELETE' });
      await loadDocs();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="native-page">
      <div className="toolbar">
        <div><strong>معلومات الشركة</strong></div>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'إلغاء' : '+ إضافة مصدر معرفي'}</button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      {showAdd && (
        <form className="form-card" onSubmit={handleAdd}>
          <h3>إضافة مستند معرفي جديد (Vector Embeddings)</h3>
          <div className="form-grid">
            <div className="form-group"><label>عنوان المستند</label><input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: سياسة الاستبدال والاسترجاع" /></div>
            <div className="form-group">
              <label>نوع المصدر</label>
              <select value={form.sourceKind} onChange={(e) => setForm({ ...form, sourceKind: e.target.value })}>
                <option value="text">نص مباشر (Text)</option>
                <option value="url">رابط مرجعي مع نص من الموقع</option>
                <option value="faq">أسئلة شائعة (FAQ)</option>
              </select>
            </div>
            {form.sourceKind === 'url' && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>رابط المصدر (URL)</label><input required value={form.sourceUri} onChange={(e) => setForm({ ...form, sourceUri: e.target.value })} placeholder="https://example.com/faq" /></div>
            )}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>المحتوى النصي</label><textarea required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows="4" placeholder={form.sourceKind === 'url' ? 'الصق هنا محتوى الصفحة المهم. جلب الموقع تلقائياً غير مفعّل بعد لحماية الخادم.' : 'اكتب أو الصق النصوص والتفاصيل التي سيعتمد عليها المساعد الآلي…'} /></div>
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ وإرسال للمعالجة'}</button>
        </form>
      )}

      <div className="data-card">
        {loading ? <div className="list-state"><div className="spinner" />جارٍ تحميل مصادر المعرفة…</div> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>العنوان</th>
                <th>نوع المصدر</th>
                <th>المعرف/الرابط</th>
                <th>حالة المعالجة</th>
                <th>تاريخ الإضافة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && <tr><td colSpan="6" className="empty-state">لم تُضف أي مصادر معرفة بعد.</td></tr>}
              {docs.map((d) => (
                <tr key={d.id}>
                  <td><strong>{d.title}</strong></td>
                  <td><span className="badge badge-blue">{d.source_kind}</span></td>
                  <td>{d.source_uri || 'نص داخلي'}</td>
                  <td><span className={`badge ${d.status === 'ready' ? 'badge-green' : d.status === 'pending' ? 'badge-yellow' : 'badge-gray'}`}>{d.status}</span></td>
                  <td>{new Date(d.created_at).toLocaleDateString('ar-EG')}</td>
                  <td>
                    {d.status !== 'archived' && (
                      <button className="btn-danger" onClick={() => archiveDoc(d.id)}>أرشفة</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function AiAgentView({ tenantId }) {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadPolicy = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest(`/v1/tenants/${tenantId}/ai/policy`);
      setPolicy({
        ...response.data,
        autoHandoffKeywordsText: (response.data.autoHandoffKeywords || []).join('، '),
      });
    } catch (err) {
      setError(err.message || 'تعذر تحميل إعدادات المساعد.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPolicy(); }, [tenantId]);

  const savePolicy = async (event) => {
    event.preventDefault();
    if (!policy) return;
    setSaving(true);
    setError('');
    try {
      const autoHandoffKeywords = policy.autoHandoffKeywordsText
        .split(/[،,\n]/).map((item) => item.trim()).filter(Boolean);
      const response = await apiRequest(`/v1/tenants/${tenantId}/ai/policy`, {
        method: 'PUT',
        body: JSON.stringify({
          confidenceThreshold: Number(policy.confidenceThreshold),
          sentimentEscalationEnabled: Boolean(policy.sentimentEscalationEnabled),
          fallbackReply: policy.fallbackReply,
          customSystemPrompt: policy.customSystemPrompt,
          autoHandoffKeywords,
          escalationInboxId: policy.escalationInboxId ? Number(policy.escalationInboxId) : null,
        }),
      });
      setPolicy({ ...response.data, autoHandoffKeywordsText: autoHandoffKeywords.join('، ') });
    } catch (err) {
      setError(err.message || 'تعذر حفظ إعدادات المساعد.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="native-page"><div className="list-state"><div className="spinner"/>جارٍ تحميل إعدادات المساعد…</div></section>;
  if (!policy) return <section className="native-page">{error && <div className="inline-error">{error}</div>}</section>;

  const providerReady = policy.provider?.configured;
  return (
    <section className="native-page ai-agent-page">
      <div className="agent-status-grid">
        <article className="agent-status-card">
          <span className={`agent-status-icon ${providerReady ? 'ready' : 'warning'}`}><Icon name="ai"/></span>
          <div><small>صياغة الإجابات</small><strong>{providerReady ? 'مفعّلة' : 'الإجابات الأساسية'}</strong><p>{providerReady ? 'يستخدم المساعد المعلومات المرتبطة بهذه الشركة فقط.' : 'تُستخدم المنتجات ومعلومات الشركة دون صياغة إضافية.'}</p></div>
        </article>
        <article className="agent-status-card">
          <span className="agent-status-icon ready"><Icon name="products"/></span>
          <div><small>مصادر الإجابة</small><strong>المنتجات ومعلومات الشركة</strong><p>كل سؤال يبحث داخل بيانات الشركة الحالية فقط.</p></div>
        </article>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="agent-layout agent-layout-single">
        <form className="data-card agent-settings" onSubmit={savePolicy}>
          <div className="panel-title"><h2>أسلوب المساعد</h2><p>تُطبق هذه الإعدادات على الشركة الحالية.</p></div>
          <div className="form-group"><label>تعليمات الإجابة</label><textarea rows="6" maxLength="4000" value={policy.customSystemPrompt} onChange={(e) => setPolicy({ ...policy, customSystemPrompt: e.target.value })} placeholder="مثال: تحدث باختصار وبلهجة ودودة، ولا تعرض منتجاً غير متوفر."/></div>
          <div className="form-group"><label>دقة المطابقة المطلوبة: {Math.round(Number(policy.confidenceThreshold) * 100)}%</label><input type="range" min="0" max="1" step="0.05" value={policy.confidenceThreshold} onChange={(e) => setPolicy({ ...policy, confidenceThreshold: Number(e.target.value) })}/><small>عند عدم توفر إجابة موثوقة، تُحوّل المحادثة إلى موظف.</small></div>
          <div className="form-group"><label>رسالة عدم توفر معلومات كافية</label><textarea rows="3" maxLength="1000" value={policy.fallbackReply} onChange={(e) => setPolicy({ ...policy, fallbackReply: e.target.value })}/></div>
          <div className="form-group"><label>كلمات التحويل لموظف</label><textarea rows="3" value={policy.autoHandoffKeywordsText} onChange={(e) => setPolicy({ ...policy, autoHandoffKeywordsText: e.target.value })} placeholder="موظف، دعم، أريد شخصاً"/><small>افصل الكلمات بفاصلة عربية أو إنجليزية.</small></div>
          <div className="form-group"><label>رقم صندوق التحويل (اختياري)</label><input type="number" min="1" value={policy.escalationInboxId || ''} onChange={(e) => setPolicy({ ...policy, escalationInboxId: e.target.value })} placeholder="مثال: 3"/></div>
          <button className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}</button>
        </form>
      </div>
    </section>
  );
}

function ResponseRulesView({ tenantId }) {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', keyword: '', matchType: 'contains', actionType: 'send_reply', replyText: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const kwRes = await apiRequest(`/v1/tenants/${tenantId}/manychat/keywords`);
      setKeywords(kwRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [tenantId]);

  const handleAddKeyword = async (e) => {
    e.preventDefault();
    if (!form.keyword.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name || `قاعدة: ${form.keyword}`,
        keyword: form.keyword,
        matchType: form.matchType,
        actionType: form.actionType,
        actionPayload: form.replyText ? { replyText: form.replyText } : {},
      };
      await apiRequest(`/v1/tenants/${tenantId}/manychat/keywords`, { method: 'POST', body: JSON.stringify(payload) });
      setForm({ name: '', keyword: '', matchType: 'contains', actionType: 'send_reply', replyText: '' });
      setShowAdd(false);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteKeyword = async (ruleId) => {
    try {
      await apiRequest(`/v1/tenants/${tenantId}/manychat/keywords/${ruleId}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="native-page">
      <div className="toolbar">
        <div><strong>قواعد الاستجابة</strong></div>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'إلغاء' : 'إضافة قاعدة'}</button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      {showAdd && (
        <form className="form-card" onSubmit={handleAddKeyword}>
          <h3>قاعدة جديدة</h3>
          <div className="form-grid">
            <div className="form-group"><label>اسم القاعدة</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: استفسار عن الأسعار" /></div>
            <div className="form-group"><label>الكلمة أو العبارة</label><input required value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} placeholder="سعر، كم السعر، أسعار" /></div>
            <div className="form-group">
              <label>نوع التطابق</label>
              <select value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value })}>
                <option value="contains">تظهر ضمن الرسالة</option>
                <option value="exact">تطابق الرسالة كاملة</option>
                <option value="starts_with">تبدأ بها الرسالة</option>
              </select>
            </div>
            <div className="form-group">
              <label>الاستجابة</label>
              <select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })}>
                <option value="send_reply">إرسال رد جاهز</option>
                <option value="ai_rag_query">الإجابة من معلومات الشركة</option>
                <option value="handoff_human">تحويل إلى موظف</option>
              </select>
            </div>
            {form.actionType === 'send_reply' && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>نص الرد</label>
                <textarea value={form.replyText} onChange={(e) => setForm({ ...form, replyText: e.target.value })} rows="2" placeholder="اكتب الرد الذي سيُرسل للعميل" />
              </div>
            )}
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ القاعدة'}</button>
        </form>
      )}

      <div className="data-card">
        {loading ? <div className="list-state"><div className="spinner" />جارٍ تحميل البيانات…</div> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>اسم القاعدة</th>
                <th>الكلمة أو العبارة</th>
                <th>طريقة المطابقة</th>
                <th>الاستجابة</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {keywords.length === 0 && <tr><td colSpan="6" className="empty-state">لا توجد قواعد استجابة بعد.</td></tr>}
              {keywords.map((k) => (
                <tr key={k.id}>
                  <td><strong>{k.name}</strong></td>
                  <td>{k.keyword}</td>
                  <td>{({ contains: 'ضمن الرسالة', exact: 'الرسالة كاملة', starts_with: 'بداية الرسالة' })[k.match_type] || k.match_type}</td>
                  <td>{({ send_reply: 'رد جاهز', ai_rag_query: 'معلومات الشركة', handoff_human: 'تحويل إلى موظف' })[k.action_type] || k.action_type}</td>
                  <td><span className={`badge ${k.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{k.status === 'active' ? 'مفعّلة' : 'متوقفة'}</span></td>
                  <td>
                    <button className="btn-danger" onClick={() => deleteKeyword(k.id)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function MetaChannelsView({ tenantId, isAdmin }) {
  const [data, setData] = useState({ channels: [], configuration: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [onboarding, setOnboarding] = useState({ sessionId: '', provider: '', assets: [] });

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await apiRequest(`/v1/tenants/${tenantId}/meta/status`);
      setData(response.data || { channels: [], configuration: null });
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const { sessionId, error: oauthError } = readMetaOAuthCallback(location.search);
    if (oauthError) {
      setError('تعذر إكمال ربط Meta. أعد المحاولة وتأكد من منح الصلاحيات المطلوبة.');
      const url = new URL(location.href);
      url.searchParams.delete('meta_error');
      url.searchParams.delete('meta_onboarding');
      history.replaceState({}, '', url);
      return;
    }
    if (sessionId && tenantId) {
      apiRequest(`/v1/tenants/${tenantId}/meta/oauth/${sessionId}/assets`)
        .then((response) => setOnboarding({ sessionId, provider: response.data.provider, assets: response.data.assets || [] }))
        .catch((err) => setError(err.message));
    }
  }, [tenantId]);

  const startOnboarding = async (provider) => {
    setBusy(true);
    try {
      const response = await apiRequest(`/v1/tenants/${tenantId}/meta/oauth/start`, {
        method: 'POST', body: JSON.stringify({ provider }),
      });
      location.assign(response.data.authorizationUrl);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const completeOnboarding = async (assetId) => {
    setBusy(true);
    try {
      await apiRequest(`/v1/tenants/${tenantId}/meta/oauth/complete`, {
        method: 'POST', body: JSON.stringify({ sessionId: onboarding.sessionId, assetId }),
      });
      const url = new URL(location.href);
      url.searchParams.delete('meta_onboarding');
      history.replaceState({}, '', url);
      setOnboarding({ sessionId: '', provider: '', assets: [] });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const syncInstagram = async () => {
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/v1/tenants/${tenantId}/meta/oauth/sync`, { method: 'POST' });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const disconnectChannel = async (channel) => {
    if (!window.confirm(`سيتم إيقاف ${channel.display_name} وحذف رمز الوصول المحفوظ. هل تريد المتابعة؟`)) return;
    setBusy(true);
    try {
      await apiRequest(`/v1/tenants/${tenantId}/meta/oauth/disconnect`, {
        method: 'POST', body: JSON.stringify({ channelId: channel.id }),
      });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const configuration = data.configuration;
  const providerLabel = { messenger: 'Facebook', instagram: 'Instagram', whatsapp: 'WhatsApp' };
  const statusLabel = { active: 'متصل', disabled: 'غير متصل', pending: 'قيد الربط', error: 'يحتاج مراجعة' };
  return (
    <section className="native-page">
      <div className="toolbar">
        <div><strong>الحسابات المرتبطة</strong></div>
        <button className="btn-primary" onClick={syncInstagram} disabled={loading || busy}>{busy ? 'جارٍ المزامنة…' : 'مزامنة المحادثات'}</button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {configuration && !configuration.ready && (
        <div className="inline-error">إعداد ربط الحسابات غير مكتمل.</div>
      )}
      {configuration?.ready && !configuration.publicHttps && (
        <div className="inline-error">تعذر استقبال الرسائل حالياً. أكمل إعداد عنوان الخدمة الآمن.</div>
      )}
      {isAdmin && (
        <div className="channel-connect"><div><h2>إضافة حساب</h2><p>اختر القناة، ثم وافق على الوصول من صفحة الحساب الرسمية.</p></div>
          <div className="channel-actions">
            <button type="button" className="btn-secondary" disabled={busy || !configuration?.ready} onClick={() => startOnboarding('messenger')}>إضافة Facebook</button>
            <button type="button" className="btn-primary" disabled={busy || !configuration?.ready} onClick={() => startOnboarding('instagram')}>إضافة Instagram</button>
          </div></div>
      )}
      {onboarding.sessionId && (
        <div className="account-picker"><h2>اختر الحساب</h2>
          {!onboarding.assets.length && <p>لا توجد حسابات متاحة للربط.</p>}
          <div className="account-options">{onboarding.assets.map((asset) => <button type="button" key={asset.id} className="btn-secondary" disabled={busy} onClick={() => completeOnboarding(asset.id)}>{asset.name}</button>)}</div>
        </div>
      )}
      <div className="channel-list">
        {loading && <div className="list-state"><div className="spinner" />جارٍ تحميل الحسابات…</div>}
        {!loading && !data.channels.length && <div className="empty-state">لم يُربط أي حساب بهذه الشركة بعد.</div>}
        {!loading && data.channels.map((channel) => (
          <article className="channel-row" key={channel.id}>
            <span className="channel-logo">{(providerLabel[channel.provider] || channel.provider).slice(0, 1)}</span>
            <div className="channel-copy"><strong>{channel.display_name}</strong><small>{providerLabel[channel.provider] || channel.provider}</small>{channel.last_error && <span className="channel-error">يحتاج هذا الحساب إلى مراجعة.</span>}</div>
            <span className={`badge ${channel.status === 'active' ? 'badge-green' : 'badge-yellow'}`}>{statusLabel[channel.status] || channel.status}</span>
            {isAdmin && channel.status !== 'disabled' && <button className="btn-danger" disabled={busy} onClick={() => disconnectChannel(channel)}>إلغاء الربط</button>}
          </article>
        ))}
      </div>
    </section>
  );
}

function App() {
  const requestedService = new URLSearchParams(location.search).get('service');
  const initial = ({ manychat: 'rules', automations: 'flows' })[requestedService] || requestedService;
  const [active, setActive] = useState(services[initial] ? initial : 'overview');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [loadedFrames, setLoadedFrames] = useState({});
  const [loadingFrames, setLoadingFrames] = useState({});
  const [frameUrls, setFrameUrls] = useState({});
  const [frameErrors, setFrameErrors] = useState({});
  const [frameTenantIds, setFrameTenantIds] = useState({});
  const [loggingOut, setLoggingOut] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const frameLoadAttempts = useRef({});
  const frameLoadTimers = useRef({});
  const chatwootSessionRequest = useRef(0);

  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');

  const loadTenants = async () => {
    try {
      const response = await apiRequest('/v1/tenants');
      const list = response.data || [];
      setTenants(list);
      setSelectedTenantId((currentId) => (
        list.some((tenant) => tenant.id === currentId) ? currentId : list[0]?.id || ''
      ));
    } catch (err) {
      console.error('Failed to load tenants:', err);
    }
  };

  useEffect(() => {
    document.documentElement.style.setProperty('--primary', primary);
    document.title = brand;
    keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
      .then((authenticated) => {
        if (!authenticated) return keycloak.login();
        setReady(true);
        return undefined;
      })
      .catch(() => setError('تعذر الاتصال بخدمة تسجيل الدخول. تحقق من DNS وحالة Keycloak.'));
    return () => Object.values(frameLoadTimers.current).forEach(window.clearTimeout);
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const clearInstallPrompt = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', clearInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', clearInstallPrompt);
    };
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    loadTenants();
    const timer = setInterval(() => keycloak.updateToken(60).catch(() => keycloak.login()), 30000);
    return () => clearInterval(timer);
  }, [ready]);

  const user = useMemo(() => keycloak.tokenParsed || {}, [ready]);
  const realmRoles = user.realm_access?.roles || [];
  const clientRoles = Object.values(user.resource_access || {}).flatMap((access) => access.roles || []);
  const isAdmin = [...realmRoles, ...clientRoles].includes('platform-admin');
  const effectiveActive = services[active]?.adminOnly && !isAdmin ? 'overview' : active;
  const service = services[effectiveActive];
  const showTenantBar = shouldShowTenantBar({ tenantCount: tenants.length, service, active: effectiveActive });
  const beginFrameLoading = (key) => {
    const attempt = (frameLoadAttempts.current[key] || 0) + 1;
    frameLoadAttempts.current[key] = attempt;
    window.clearTimeout(frameLoadTimers.current[key]);
    setLoadingFrames((frames) => ({ ...frames, [key]: true }));
    frameLoadTimers.current[key] = window.setTimeout(() => {
      if (frameLoadAttempts.current[key] !== attempt) return;
      setLoadingFrames((frames) => ({ ...frames, [key]: false }));
    }, FRAME_LOADING_LIMIT_MS);
  };
  const finishFrameLoading = (key) => {
    frameLoadAttempts.current[key] = (frameLoadAttempts.current[key] || 0) + 1;
    window.clearTimeout(frameLoadTimers.current[key]);
    setLoadingFrames((frames) => ({ ...frames, [key]: false }));
  };
  const selectService = async (key, updateHistory = true, forceReload = false) => {
    setActive(key);
    if (updateHistory) history.replaceState({}, '', `?service=${key}`);
    if (services[key].native) return;
    const targetTenantId = key === 'inbox' ? selectedTenantId || tenants[0]?.id || '' : selectedTenantId;
    if (key === 'inbox' && !targetTenantId) {
      finishFrameLoading('inbox');
      setFrameErrors((errors) => ({ ...errors, inbox: 'أنشئ شركة أولًا، ثم اربطها بصندوق المحادثات.' }));
      return;
    }
    if (key === 'inbox' && targetTenantId !== selectedTenantId) setSelectedTenantId(targetTenantId);
    const needsLoad = shouldLoadEmbeddedFrame({
      key,
      loadedFrames,
      frameTenantIds,
      selectedTenantId: targetTenantId,
      forceReload,
    });
    if (!needsLoad) return;
    setLoadedFrames((frames) => ({ ...frames, [key]: true }));
    beginFrameLoading(key);
    setFrameErrors((errors) => ({ ...errors, [key]: '' }));
    if (key === 'inbox') {
      const sessionRequestId = chatwootSessionRequest.current + 1;
      chatwootSessionRequest.current = sessionRequestId;
      setFrameTenantIds((ids) => ({ ...ids, inbox: targetTenantId }));
      try {
        const response = await apiRequest('/v1/sessions/chatwoot', {
          method: 'POST',
          body: JSON.stringify({ tenantId: targetTenantId }),
        });
        if (chatwootSessionRequest.current !== sessionRequestId) return;
        setFrameUrls((urls) => ({ ...urls, inbox: response.data.url }));
      } catch (err) {
        if (chatwootSessionRequest.current !== sessionRequestId) return;
        finishFrameLoading('inbox');
        setFrameErrors((errors) => ({ ...errors, inbox: err.message || 'تعذر فتح صندوق المحادثات.' }));
      }
    }
  };

  const frameSource = (key, item) => (
    key === 'flows'
      ? `${serviceUrl('flows')}/sso/typebot.html?framePolicy=2&return=${encodeURIComponent(item.url)}`
      : frameUrls[key] || ''
  );

  useEffect(() => {
    if (!ready || services[effectiveActive].native) return;
    const needsLoad = shouldLoadEmbeddedFrame({
      key: effectiveActive,
      loadedFrames,
      frameTenantIds,
      selectedTenantId,
    });
    if (needsLoad) selectService(effectiveActive, false);
  }, [ready, effectiveActive, selectedTenantId, loadedFrames, frameTenantIds.inbox]);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await Promise.allSettled([
      logoutEngine('chatwoot', serviceUrl('inbox')),
      logoutEngine('typebot', serviceUrl('flows')),
    ]);
    await keycloak.logout({ redirectUri: location.origin });
  };

  const installDesktopApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (error) return <main className="center-state"><div className="error-card">{error}</div></main>;
  if (!ready) return <main className="center-state"><div className="spinner"/><p>جارٍ تسجيل الدخول…</p></main>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">M</span><span><strong>{brand}</strong><small>مساحة إدارة العمليات</small></span></div>
        <nav aria-label="التنقل الرئيسي">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group}>
              <span className="nav-group-label">{group}</span>
              {Object.entries(services).filter(([, item]) => item.group === group && (!item.adminOnly || isAdmin)).map(([key, item]) => (
                <button key={key} className={effectiveActive === key ? 'nav-item active' : 'nav-item'} onClick={() => selectService(key)} aria-current={effectiveActive === key ? 'page' : undefined}>
                  <span className="nav-icon"><Icon name={key} /></span>
                  <span><b>{item.label}</b><small>{item.description}</small></span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="profile">
          <span className="avatar">{(user.name || user.preferred_username || 'U').slice(0, 1).toUpperCase()}</span>
          <span className="profile-copy"><b>{user.name || user.preferred_username}</b><small>{user.email}</small></span>
          <button className="logout" title="تسجيل الخروج" aria-label="تسجيل الخروج" disabled={loggingOut} onClick={logout}>{loggingOut ? '…' : <Icon name="logout" />}</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div className="page-heading"><span className="page-icon"><Icon name={effectiveActive} size={19} /></span><div><h1>{service.label}</h1><p>{service.description}</p></div></div>
          <div className="header-actions">
            {installPrompt && <button type="button" className="install-app" onClick={installDesktopApp}>تثبيت التطبيق</button>}
            {showTenantBar && <TenantBar tenants={tenants} selectedId={selectedTenantId} onSelect={setSelectedTenantId} />}
          </div>
        </header>

        {effectiveActive === 'overview' && <Overview tenants={tenants} onRefresh={loadTenants} isAdmin={isAdmin} />}
        {effectiveActive === 'employees' && isAdmin && <EmployeesView tenants={tenants} currentSubject={user.sub} />}
        {effectiveActive === 'contacts' && <ContactsView tenantId={selectedTenantId} />}
        {effectiveActive === 'products' && <ProductsView tenantId={selectedTenantId} />}
        {effectiveActive === 'knowledge' && <KnowledgeView tenantId={selectedTenantId} />}
        {effectiveActive === 'ai' && <AiAgentView tenantId={selectedTenantId} />}
        {effectiveActive === 'rules' && <ResponseRulesView tenantId={selectedTenantId} />}
        {effectiveActive === 'channels' && <MetaChannelsView tenantId={selectedTenantId} isAdmin={isAdmin} />}

        {Object.keys(loadedFrames).length > 0 && (
          <section className={`frame-wrap ${service.native ? 'frame-wrap-hidden' : ''}`}>
            {Object.entries(services).filter(([key, item]) => !item.native && loadedFrames[key]).map(([key, item]) => (
              <React.Fragment key={key}>
                {loadingFrames[key] && effectiveActive === key && <div className="frame-loading"><div className="spinner"/><strong>جارٍ فتح {item.label}</strong></div>}
                {frameErrors[key] && effectiveActive === key && (
                  <div className="frame-loading">
                    <div className="error-card frame-error-card">
                      <strong>تعذر فتح {item.label}</strong>
                      <span>{frameErrors[key]}</span>
                      <button type="button" onClick={() => selectService(key, false, true)}>إعادة المحاولة</button>
                    </div>
                  </div>
                )}
                {frameSource(key, item) && <iframe className={effectiveActive === key ? 'embedded-frame active-frame' : 'embedded-frame'} title={item.label}
                  src={frameSource(key, item)} allow="clipboard-read; clipboard-write; fullscreen"
                  onLoad={() => finishFrameLoading(key)} />}
              </React.Fragment>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js'));
}
