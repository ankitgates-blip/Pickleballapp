import { describe, it, expect } from 'vitest';

describe('jsPDF + jspdf-autotable wiring', () => {
  it('draws a table via autoTable(doc, options) and populates doc.lastAutoTable.finalY', async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);

    const doc = new jsPDF();

    autoTable(doc, { head: [['A', 'B']], body: [['1', '2']] });

    // @ts-expect-error -- autoTable augments jsPDF's instance type with lastAutoTable at runtime
    expect(doc.lastAutoTable).toBeDefined();
    // @ts-expect-error -- see above
    expect(typeof doc.lastAutoTable.finalY).toBe('number');
    // @ts-expect-error -- see above
    expect(doc.lastAutoTable.finalY).toBeGreaterThan(0);
  });
});
