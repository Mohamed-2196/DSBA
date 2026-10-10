import { useModules } from '../../../state/modules';
import { Select, TextArea, TextField } from '../../../ui';
import { EXAM_KINDS, KINDS, isLibraryKind } from '../kinds';
import { NO_MODULE, type ItemFormErrors, type ItemFormValues } from '../itemForm';

const YEARS = [1, 2, 3] as const;

/** Title, type, module (or year), exam sitting, author credit and description. */
export function ItemFields({
  values,
  errors,
  onChange,
  disabled = false,
}: {
  values: ItemFormValues;
  errors: ItemFormErrors;
  onChange: (patch: Partial<ItemFormValues>) => void;
  disabled?: boolean;
}) {
  const { getModulesForYear } = useModules();
  const exam = EXAM_KINDS.has(values.kind);
  return (
    <div className="lib-form">
      <TextField
        label="Title"
        required
        value={values.title}
        maxLength={200}
        onChange={(e) => onChange({ title: e.target.value })}
        error={errors.title}
        hint="Shown in the library. Include the chapter or the exam year if it helps people find it."
        placeholder="Chapter 4 notes"
        disabled={disabled}
      />
      <div className="lib-form__row">
        <Select
          label="Module"
          required
          value={values.module}
          onChange={(e) => onChange({ module: e.target.value })}
          error={errors.module}
          disabled={disabled}
        >
          <option value="" disabled>
            Choose a module
          </option>
          {YEARS.map((y) => (
            <optgroup key={y} label={`Year ${y}`}>
              {getModulesForYear(y).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.unitCode ? `${m.unitCode} ${m.name}` : m.name}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={NO_MODULE}>Not about one module</option>
        </Select>
        <Select
          label="Type"
          required
          value={values.kind}
          onChange={(e) => {
            if (isLibraryKind(e.target.value)) onChange({ kind: e.target.value });
          }}
          error={errors.kind}
          options={KINDS.map((k) => ({ value: k.id, label: k.label }))}
          disabled={disabled}
        />
      </div>
      {values.module === NO_MODULE ? (
        <Select
          label="Year"
          value={values.year}
          onChange={(e) => onChange({ year: e.target.value as ItemFormValues['year'] })}
          error={errors.year}
          hint="Who it is most useful for."
          disabled={disabled}
          options={[
            { value: '', label: 'All years' },
            ...YEARS.map((y) => ({ value: String(y), label: `Year ${y}` })),
          ]}
        />
      ) : null}
      {exam ? (
        <div className="lib-form__row lib-form__row--exam">
          <TextField
            label="Exam year"
            inputMode="numeric"
            value={values.examYear}
            onChange={(e) => onChange({ examYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            error={errors.examYear}
            placeholder={String(new Date().getFullYear() - 1)}
            disabled={disabled}
          />
          <Select
            label="Zone"
            value={values.zone}
            onChange={(e) => onChange({ zone: e.target.value as ItemFormValues['zone'] })}
            error={errors.zone}
            disabled={disabled}
            options={[
              { value: '', label: 'No zone' },
              { value: 'A', label: 'Zone A' },
              { value: 'B', label: 'Zone B' },
            ]}
          />
        </div>
      ) : null}
      <TextField
        label="Author"
        value={values.authorName}
        maxLength={120}
        onChange={(e) => onChange({ authorName: e.target.value })}
        error={errors.authorName}
        hint="Credit whoever wrote it, for example University of London or a classmate. Leave it empty if it’s yours."
        disabled={disabled}
      />
      <TextArea
        label="Description"
        rows={3}
        value={values.description}
        maxLength={2000}
        onChange={(e) => onChange({ description: e.target.value })}
        error={errors.description}
        hint="Optional: what’s in it and what it’s good for."
        disabled={disabled}
      />
    </div>
  );
}
