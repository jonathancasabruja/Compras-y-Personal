# Invoice App Corrections TODO

- [ ] Make DV field optional in PersonForm and Supabase schema
- [ ] Add department selection: TAPROOM ($30), COCINA ($25), DISTRIBUCIÓN ($25), EVENTO ($35) with multi-select
- [ ] Add days worked input per department
- [ ] Add extra hours input ($5/hr)
- [ ] Auto-calculate total: (days × rate per dept) + (extra hours × $5)
- [ ] Allow generating multiple invoices at once (one per department selected)
- [ ] Include department/event in invoice notes section
- [ ] Adjust print format to fit exactly 1 page per invoice
- [ ] Batch print/save all generated invoices
- [ ] Update Supabase facturas table to include department and calculation fields
