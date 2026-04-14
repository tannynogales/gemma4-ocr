import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const normalizeRun = (value: string): string => value.replace(/[.\s]/g, '').toUpperCase();

export const isValidRun = (value: string | null | undefined): boolean => {
  if (!value) {
    return true;
  }

  const compactValue = normalizeRun(value);
  const digits = compactValue.slice(0, -1).replace(/\D/g, '');
  const verifier = compactValue.slice(-1).replace(/[^0-9K]/g, '');

  if (!digits || !verifier) {
    return false;
  }

  let sum = 0;
  let multiplier = 2;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number.parseInt(digits[index], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expectedVerifier =
    remainder === 11 ? '0' : remainder === 10 ? 'K' : String(remainder);

  return expectedVerifier === verifier;
};

export const runValidator = (): ValidatorFn => {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').trim();

    if (!value) {
      return null;
    }

    return isValidRun(value) ? null : { invalidRun: true };
  };
};
