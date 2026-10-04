import { CONTRACTOR_SERVICE_OPTIONS, SERVICE_GROUPS } from '../../shared/contractorServices';
export default function ContractorServiceChoices({ selected, onChange, legacy = false, disabled = false }: { selected: string[]; onChange: (ids: string[]) => void; legacy?: boolean; disabled?: boolean }) {
 return <div className="space-y-4" data-testid="contractor-service-choices">
 <h2 className="text-lg font-semibold">Homeowner services you offer</h2>
 <p className="text-sm text-muted-foreground">Choose each service you provide. Trade headings do not select services or establish licensing. Clearing all services pauses new matching.</p>
 {legacy && <p role="status" className="text-sm">Confirm your services to enable new matching. Previous trade selections are retained.</p>}
 <p aria-live="polite" className="text-sm font-semibold">{selected.length} of {CONTRACTOR_SERVICE_OPTIONS.length} services selected</p>
 {SERVICE_GROUPS.map(group => <fieldset key={group.name} disabled={disabled} className="space-y-2"><legend className="mb-2 font-semibold">{group.name}</legend><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{group.services.map(name => { const option = CONTRACTOR_SERVICE_OPTIONS.find(s => s.name === name)!; return <label key={option.id} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm text-foreground ${selected.includes(option.id) ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}><input type="checkbox" className="h-5 w-5 shrink-0 accent-orange-600" checked={selected.includes(option.id)} onChange={() => onChange(selected.includes(option.id) ? selected.filter(id => id !== option.id) : [...selected, option.id])} /><span>{name}</span></label>; })}</div></fieldset>)}
 </div>;
}
