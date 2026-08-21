export type FormTier = {
  emoji: string;
  label: string;
};

export function formTierFor(formPercentage: number): FormTier {
  if (formPercentage >= 81) {
    return { emoji: '🔥', label: 'ON FIRE' };
  }
  if (formPercentage >= 61) {
    return { emoji: '📈', label: 'IN FORM' };
  }
  if (formPercentage >= 41) {
    return { emoji: '➖', label: 'STEADY' };
  }
  if (formPercentage >= 21) {
    return { emoji: '📉', label: 'COOLING OFF' };
  }
  return { emoji: '🧊', label: 'COLD' };
}
