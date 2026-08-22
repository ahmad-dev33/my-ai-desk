import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Keycloak from 'keycloak-js';
import './styles.css';
import { apiErrorMessage } from './api-errors.js';
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
    description: 'إدارة العملاء ومساحات العمل من منصتك الموحدة',
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
    label: 'جهات الاتصال (CRM)',
    description: 'إدارة سجلات العملاء والهويات عبر القنوات',
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
    label: 'قاعدة المعرفة (AI)',
    description: 'مصادر المعلومات والمستندات للبحث المعرفي RAG',
    group: 'بيانات الشركة',
    native: true,
  },
  ai: {
    label: 'وكيل الذكاء الاصطناعي',
    description: 'ضبط أسلوب الإجابة والتحويل للموظف وتجربة الردود',
    group: 'بيانات الشركة',
    native: true,
  },
  automations: {
    label: 'سجل الأتمتة',
    description: 'إدارة وتفعيل تدفقات Typebot ومسارات الروبوت',
    group: 'الأتمتة والقنوات',
    native: true,
  },
  manychat: {
    label: 'أدوات التسويق (ManyChat)',
    description: 'الكلمات المفتاحية، الحمالات الجماعية والسلاسل الزمنية',
    group: 'الأتمتة والقنوات',
    native: true,
  },
  channels: {
    label: 'قنوات Meta',
    description: 'ربط Facebook وInstagram وWhatsApp ومراقبة الرسائل',
    group: 'الأتمتة والقنوات',
    native: true,
  },
  inbox: {
    label: 'صندوق المحادثات',
    description: 'WhatsApp وInstagram وباقي القنوات',
    url: serviceUrl('inbox'),
    group: 'مساحات التشغيل',
  },
  flows: {
    label: 'بناء التدفقات',
    description: 'محرر Typebot لتصميم المحادثات',
    url: serviceUrl('flows'),
    group: 'مساحات التشغيل',
  },
};

const navigationGroups = ['الإدارة', 'بيانات الشركة', 'الأتمتة والقنوات', 'مساحات التشغيل'];
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
        <article className="stat-card"><span>مصدر البيانات</span><strong>موحّد</strong><small>جهات الاتصال والأتمتة تحت إدارة منصتك</small></article>
        <article className="stat-card"><span>المحركات</span><strong>2</strong><small>Chatwoot للمحادثات وTypebot للتدفقات</small></article>
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

  const loadContacts = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/v1/tenants/${tenantId}/contacts?search=${encodeURIComponent(search)}`);
      setContacts(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadContacts(); }, [tenantId, search]);

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

  const loadProducts = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/v1/tenants/${tenantId}/products?search=${encodeURIComponent(search)}`);
      setProducts(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadProducts(); }, [tenantId, search]);

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
        <div><strong>مصادر المعرفة لمُحرك الـ AI (RAG)</strong></div>
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
      setError(err.message || 'تعذر تحميل إعدادات وكيل الذكاء الاصطناعي.');
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
      setError(err.message || 'تعذر حفظ إعدادات الوكيل.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="native-page"><div className="list-state"><div className="spinner"/>جارٍ تحميل إعدادات الوكيل…</div></section>;
  if (!policy) return <section className="native-page">{error && <div className="inline-error">{error}</div>}</section>;

  const providerReady = policy.provider?.configured;
  return (
    <section className="native-page ai-agent-page">
      <div className="agent-status-grid">
        <article className="agent-status-card">
          <span className={`agent-status-icon ${providerReady ? 'ready' : 'warning'}`}><Icon name="ai"/></span>
          <div><small>محرك توليد الإجابة</small><strong>{providerReady ? policy.provider.model : 'وضع آمن دون نموذج خارجي'}</strong><p>{providerReady ? 'OpenAI متصل، وتُرسل إليه معلومات الشركة ذات الصلة فقط.' : 'الرد حالياً يقتبس أفضل منتج أو فقرة مطابقة دون صياغة ذكية.'}</p></div>
        </article>
        <article className="agent-status-card">
          <span className="agent-status-icon ready"><Icon name="products"/></span>
          <div><small>مصادر الحقيقة</small><strong>المنتجات + قاعدة المعرفة</strong><p>كل سؤال يبحث داخل بيانات الشركة الحالية فقط، ولا يخلطها مع شركة أخرى.</p></div>
        </article>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="agent-layout agent-layout-single">
        <form className="data-card agent-settings" onSubmit={savePolicy}>
          <div className="panel-title"><h2>سلوك الوكيل</h2><p>هذه التعليمات خاصة بالشركة المحددة في الأعلى.</p></div>
          <div className="form-group"><label>تعليمات الوكيل</label><textarea rows="6" maxLength="4000" value={policy.customSystemPrompt} onChange={(e) => setPolicy({ ...policy, customSystemPrompt: e.target.value })} placeholder="مثال: تحدث باختصار وبلهجة ودودة، ولا تعرض منتجاً غير متوفر."/></div>
          <div className="form-group"><label>الحد الأدنى للثقة: {Math.round(Number(policy.confidenceThreshold) * 100)}%</label><input type="range" min="0" max="1" step="0.05" value={policy.confidenceThreshold} onChange={(e) => setPolicy({ ...policy, confidenceThreshold: Number(e.target.value) })}/><small>إذا كانت المطابقة أضعف من هذا الحد، لا يخمّن الوكيل ويطلب تدخل موظف.</small></div>
          <div className="form-group"><label>رسالة عدم توفر معلومات كافية</label><textarea rows="3" maxLength="1000" value={policy.fallbackReply} onChange={(e) => setPolicy({ ...policy, fallbackReply: e.target.value })}/></div>
          <div className="form-group"><label>كلمات التحويل لموظف</label><textarea rows="3" value={policy.autoHandoffKeywordsText} onChange={(e) => setPolicy({ ...policy, autoHandoffKeywordsText: e.target.value })} placeholder="موظف، دعم، أريد شخصاً"/><small>افصل الكلمات بفاصلة عربية أو إنجليزية.</small></div>
          <div className="form-group"><label>رقم صندوق التصعيد في Chatwoot (اختياري)</label><input type="number" min="1" value={policy.escalationInboxId || ''} onChange={(e) => setPolicy({ ...policy, escalationInboxId: e.target.value })} placeholder="مثال: 3"/></div>
          <button className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ إعدادات الوكيل'}</button>
        </form>
      </div>
    </section>
  );
}

function AutomationsView({ tenantId }) {
  const [automations, setAutomations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', engineRef: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadAutomations = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/v1/tenants/${tenantId}/automations`);
      setAutomations(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAutomations(); }, [tenantId]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const payload = { name: form.name, description: form.description, engine: 'typebot', engineRef: form.engineRef || null };
      await apiRequest(`/v1/tenants/${tenantId}/automations`, { method: 'POST', body: JSON.stringify(payload) });
      setForm({ name: '', description: '', engineRef: '' });
      setShowAdd(false);
      await loadAutomations();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const publishAutomation = async (automationId, engineRef) => {
    if (!engineRef) {
      setError('يرجى تحديد Typebot Public ID للرد الآلي قبل النشر.');
      return;
    }
    try {
      await apiRequest(`/v1/tenants/${tenantId}/automations/${automationId}/publish`, {
        method: 'POST',
        body: JSON.stringify({ engineRef, definitionSnapshot: {} }),
      });
      await loadAutomations();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="native-page">
      <div className="toolbar">
        <div><strong>سجل مسارات الردود الآلية والـ Typebots</strong></div>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'إلغاء' : '+ تسجيل مسار جديد'}</button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      {showAdd && (
        <form className="form-card" onSubmit={handleAdd}>
          <h3>تسجيل مسار أتمتة جديد</h3>
          <div className="form-grid">
            <div className="form-group"><label>اسم المسار</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: بوت استقبال طلبات الصيانة" /></div>
            <div className="form-group"><label>Typebot Public ID</label><input value={form.engineRef} onChange={(e) => setForm({ ...form, engineRef: e.target.value })} placeholder="my-custom-typebot-id" /></div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>الوصف</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows="2" placeholder="وصف وظيفة ومسار البوت…" /></div>
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ المسار'}</button>
        </form>
      )}

      <div className="data-card">
        {loading ? <div className="list-state"><div className="spinner" />جارٍ تحميل المسارات…</div> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>اسم المسار</th>
                <th>المحرك</th>
                <th>Public ID (Typebot)</th>
                <th>الإصدار</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {automations.length === 0 && <tr><td colSpan="6" className="empty-state">لا توجد مسارات أتمتة مسجلة بعد.</td></tr>}
              {automations.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong><br /><small style={{ color: 'var(--muted)' }}>{a.description}</small></td>
                  <td><span className="badge badge-blue">{a.engine}</span></td>
                  <td><code>{a.engine_ref || 'غير محدد'}</code></td>
                  <td>v{a.current_version}</td>
                  <td><span className={`badge ${a.status === 'published' ? 'badge-green' : 'badge-yellow'}`}>{a.status}</span></td>
                  <td>
                    {a.status !== 'published' && a.engine_ref && (
                      <button className="btn-primary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => publishAutomation(a.id, a.engine_ref)}>نشر الإصدار</button>
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

function ManychatView({ tenantId }) {
  const [keywords, setKeywords] = useState([]);
  const [analytics, setAnalytics] = useState({ summary: [], recentEvents: [] });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', keyword: '', matchType: 'contains', actionType: 'send_reply', replyText: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [kwRes, analyticsRes] = await Promise.all([
        apiRequest(`/v1/tenants/${tenantId}/manychat/keywords`),
        apiRequest(`/v1/tenants/${tenantId}/manychat/analytics`),
      ]);
      setKeywords(kwRes.data || []);
      setAnalytics(analyticsRes.data || { summary: [], recentEvents: [] });
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
        <div><strong>قواعد الكلمات المفتاحية وأدوات التسويق</strong></div>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? 'إلغاء' : '+ كلمة مفتاحية جديدة'}</button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      {showAdd && (
        <form className="form-card" onSubmit={handleAddKeyword}>
          <h3>إضافة قاعدة كلمة مفتاحية جديدة</h3>
          <div className="form-grid">
            <div className="form-group"><label>اسم القاعدة</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: استفسار عن الأسعار" /></div>
            <div className="form-group"><label>الكلمة المفتاحية (Keyword)</label><input required value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} placeholder="سعر، كم السعر، اسعار" /></div>
            <div className="form-group">
              <label>نوع التطابق</label>
              <select value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value })}>
                <option value="contains">تطابق جزئي (Contains)</option>
                <option value="exact">تطابق تام (Exact)</option>
                <option value="starts_with">يبدأ بـ (Starts with)</option>
                <option value="regex">تعبير نمطي (Regex)</option>
              </select>
            </div>
            <div className="form-group">
              <label>الإجراء المتخذ</label>
              <select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })}>
                <option value="send_reply">إرسال رد نصي مباشر</option>
                <option value="ai_rag_query">البحث في قاعدة المعرفة (RAG)</option>
                <option value="handoff_human">تحويل للموظف البشري</option>
              </select>
            </div>
            {form.actionType === 'send_reply' && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label>نص الرد المباشر</label>
                <textarea value={form.replyText} onChange={(e) => setForm({ ...form, replyText: e.target.value })} rows="2" placeholder="اكتب نص الرد الآلي المباشر…" />
              </div>
            )}
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ الكلمة المفتاحية'}</button>
        </form>
      )}

      <div className="data-card">
        {loading ? <div className="list-state"><div className="spinner" />جارٍ تحميل البيانات…</div> : (
          <table className="data-table">
            <thead>
              <tr>
                <th>اسم القاعدة</th>
                <th>الكلمة المفتاحية</th>
                <th>نوع التطابق</th>
                <th>الإجراء</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {keywords.length === 0 && <tr><td colSpan="6" className="empty-state">لم تُضف أي كلمات مفتاحية بعد.</td></tr>}
              {keywords.map((k) => (
                <tr key={k.id}>
                  <td><strong>{k.name}</strong></td>
                  <td><code>{k.keyword}</code></td>
                  <td><span className="badge badge-blue">{k.match_type}</span></td>
                  <td><span className="badge badge-green">{k.action_type}</span></td>
                  <td><span className={`badge ${k.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{k.status}</span></td>
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
  const [data, setData] = useState({ channels: [], outbound: [], events: [], decisions: [], configuration: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [onboarding, setOnboarding] = useState({ sessionId: '', provider: '', assets: [] });

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await apiRequest(`/v1/tenants/${tenantId}/meta/status`);
      setData(response.data || { channels: [], outbound: [], events: [], decisions: [], configuration: null });
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const sessionId = new URLSearchParams(location.search).get('meta_onboarding');
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
  return (
    <section className="native-page">
      <div className="toolbar">
        <div><strong>قنوات Meta وحالة التسليم</strong><div><small>الأسرار محفوظة على الخادم ولا تظهر للموظفين.</small></div></div>
        <button className="btn-primary" onClick={load} disabled={loading}>تحديث</button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {configuration && !configuration.ready && (
        <div className="inline-error">
          <strong>ربط Meta غير مهيأ بعد.</strong>
          <div>الإعدادات الناقصة على الخادم: {configuration.missingSettings.join('، ')}</div>
        </div>
      )}
      {configuration?.ready && !configuration.publicHttps && (
        <div className="inline-error">الإعداد موجود محلياً، لكن Meta تحتاج رابط HTTPS عاماً قبل استقبال الرسائل الحقيقية.</div>
      )}
      {configuration?.publicHttps && (
        <div className="connection-summary">
          <span className="status-dot" />
          <div><strong>بوابة Meta العامة جاهزة</strong><small>{configuration.webhookUrl}</small></div>
        </div>
      )}
      {isAdmin && (
        <div className="form-card"><h3>ربط حساب حقيقي عبر Meta</h3><p>تتم الموافقة داخل Meta، ثم تعود لاختيار الصفحة أو حساب Instagram. اكتب البريد وكلمة المرور داخل نافذة Meta الرسمية فقط؛ لا يحفظهما My AI Desk.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" disabled={busy || !configuration?.ready} onClick={() => startOnboarding('messenger')}>ربط Facebook Messenger</button>
            <button type="button" className="btn-primary" disabled={busy || !configuration?.ready} onClick={() => startOnboarding('instagram')}>ربط Instagram المرتبط بالصفحة</button>
          </div></div>
      )}
      {onboarding.sessionId && (
        <div className="form-card"><h3>اختر الحساب الذي سيُربط بهذه الشركة</h3>
          {!onboarding.assets.length && <p>لم تُرجع Meta حسابات متاحة لهذا المستخدم.</p>}
          {onboarding.assets.map((asset) => <button type="button" key={asset.id} className="btn-primary" style={{ marginInlineEnd: 8, marginBottom: 8 }} disabled={busy} onClick={() => completeOnboarding(asset.id)}>{asset.name} — {asset.id}</button>)}
        </div>
      )}
      {data.channels.some((channel) => channel.status === 'active') && (
        <div className="form-card">
          <h3>اختبار Instagram الحقيقي</h3>
          <p>أرسل رسالة خاصة من حساب Instagram آخر إلى الحساب المرتبط. ستظهر الرسالة أدناه وفي صندوق المحادثات، ثم يظهر الرد وحالة تسليمه دون أي اختبار وهمي.</p>
        </div>
      )}
      <div className="data-card"><table className="data-table"><thead><tr><th>القناة</th><th>المعرف</th><th>الحالة</th><th>آخر حدث</th><th>الخطأ</th><th>إجراء</th></tr></thead><tbody>
        {!data.channels.length && <tr><td colSpan="6" className="empty-state">لا توجد قنوات Meta بعد.</td></tr>}
        {data.channels.map((channel) => <tr key={channel.id}><td>{channel.display_name}<br/><small>{channel.provider}</small></td><td><code>{channel.external_account_id}</code></td><td><span className={`badge ${channel.status === 'active' ? 'badge-green' : 'badge-yellow'}`}>{channel.status}</span></td><td>{channel.last_event_at ? new Date(channel.last_event_at).toLocaleString('ar') : '—'}</td><td>{channel.last_error || '—'}</td><td>{isAdmin && channel.status !== 'disabled' ? <button className="btn-danger" disabled={busy} onClick={() => disconnectChannel(channel)}>إلغاء الربط</button> : '—'}</td></tr>)}
      </tbody></table></div>
      <h3>آخر الرسائل والأحداث الواردة</h3>
      <div className="data-card"><table className="data-table"><thead><tr><th>القناة</th><th>نوع الحدث</th><th>الحالة</th><th>وقت الاستقبال</th><th>الخطأ</th></tr></thead><tbody>
        {!data.events.length && <tr><td colSpan="5" className="empty-state">لم تصل رسائل من Meta بعد.</td></tr>}
        {data.events.map((event) => <tr key={event.id}><td>{event.provider}</td><td><code>{event.event_type}</code></td><td><span className={`badge ${event.status === 'processed' ? 'badge-green' : 'badge-yellow'}`}>{event.status}</span></td><td>{new Date(event.received_at).toLocaleString('ar')}</td><td>{event.error_message || '—'}</td></tr>)}
      </tbody></table></div>
      <h3>آخر الردود الصادرة</h3>
      <div className="data-card"><table className="data-table"><thead><tr><th>الرد</th><th>الحالة</th><th>المحاولات</th><th>الوقت</th></tr></thead><tbody>
        {!data.outbound.length && <tr><td colSpan="4" className="empty-state">لا توجد ردود بعد.</td></tr>}
        {data.outbound.map((item) => <tr key={item.id}><td>{item.content?.text}</td><td><span className={`badge ${['sent','delivered','read'].includes(item.status) ? 'badge-green' : 'badge-yellow'}`}>{item.status}</span></td><td>{item.attempt_count}</td><td>{new Date(item.created_at).toLocaleString('ar')}</td></tr>)}
      </tbody></table></div>
    </section>
  );
}

function App() {
  const initial = new URLSearchParams(location.search).get('service');
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
      if (list.length > 0 && !selectedTenantId) {
        setSelectedTenantId(list[0].id);
      }
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
    const needsLoad = shouldLoadEmbeddedFrame({
      key,
      loadedFrames,
      frameTenantIds,
      selectedTenantId,
      forceReload,
    });
    if (!needsLoad) return;
    setLoadedFrames((frames) => ({ ...frames, [key]: true }));
    beginFrameLoading(key);
    setFrameErrors((errors) => ({ ...errors, [key]: '' }));
    if (key === 'inbox') {
      const sessionRequestId = chatwootSessionRequest.current + 1;
      chatwootSessionRequest.current = sessionRequestId;
      if (!selectedTenantId) {
        finishFrameLoading('inbox');
        setFrameErrors((errors) => ({ ...errors, inbox: 'اختر شركة مرتبطة بصندوق محادثات أولًا.' }));
        return;
      }
      setFrameTenantIds((ids) => ({ ...ids, inbox: selectedTenantId }));
      try {
        const response = await apiRequest('/v1/sessions/chatwoot', {
          method: 'POST',
          body: JSON.stringify({ tenantId: selectedTenantId }),
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
      ? `${serviceUrl('flows')}/sso/typebot.html?return=${encodeURIComponent(item.url)}`
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
        <div className="brand"><span className="brand-mark">M</span><span><strong>{brand}</strong><small>Operations workspace</small></span></div>
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
            {!service.native && <span className="session-badge"><span className="status-dot"/> جلسة موحّدة</span>}
            {!service.native && effectiveActive !== 'inbox' && <a className="open-new" href={service.url} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> فتح مستقلاً</a>}
          </div>
        </header>

        {effectiveActive === 'overview' && <Overview tenants={tenants} onRefresh={loadTenants} isAdmin={isAdmin} />}
        {effectiveActive === 'employees' && isAdmin && <EmployeesView tenants={tenants} currentSubject={user.sub} />}
        {effectiveActive === 'contacts' && <ContactsView tenantId={selectedTenantId} />}
        {effectiveActive === 'products' && <ProductsView tenantId={selectedTenantId} />}
        {effectiveActive === 'knowledge' && <KnowledgeView tenantId={selectedTenantId} />}
        {effectiveActive === 'ai' && <AiAgentView tenantId={selectedTenantId} />}
        {effectiveActive === 'automations' && <AutomationsView tenantId={selectedTenantId} />}
        {effectiveActive === 'manychat' && <ManychatView tenantId={selectedTenantId} />}
        {effectiveActive === 'channels' && <MetaChannelsView tenantId={selectedTenantId} isAdmin={isAdmin} />}

        {Object.keys(loadedFrames).length > 0 && (
          <section className={`frame-wrap ${service.native ? 'frame-wrap-hidden' : ''}`}>
            {Object.entries(services).filter(([key, item]) => !item.native && loadedFrames[key]).map(([key, item]) => (
              <React.Fragment key={key}>
                {loadingFrames[key] && effectiveActive === key && <div className="frame-loading"><div className="spinner"/><strong>جارٍ تجهيز {item.label}</strong><span>تُستخدم جلسة الدخول الحالية ولن يُطلب منك تسجيل جديد.</span></div>}
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
