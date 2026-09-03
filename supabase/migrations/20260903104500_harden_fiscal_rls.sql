begin;

-- invoices
drop policy if exists inv_org on public.invoices;
create policy inv_select on public.invoices for select to authenticated using (public.is_organization_member(organization_id));

-- invoice_items
drop policy if exists inv_items_org on public.invoice_items;
create policy inv_items_select on public.invoice_items for select to authenticated using (public.is_organization_member(organization_id));

-- invoice_events
drop policy if exists inv_evt_org on public.invoice_events;
drop policy if exists no_delete_invoice_events on public.invoice_events;
create policy inv_evt_select on public.invoice_events for select to authenticated using (public.is_organization_member(organization_id));

commit;
