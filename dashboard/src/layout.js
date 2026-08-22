export function shouldShowTenantBar({ tenantCount, service, active }) {
  return tenantCount > 0
    && (service.native || active === 'inbox')
    && active !== 'overview'
    && active !== 'employees';
}
