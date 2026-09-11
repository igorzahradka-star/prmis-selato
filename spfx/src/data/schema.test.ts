import { LISTS, listsForSite, creationOrder, indexedFields, SCHEMA_VERSION, ListDef } from './schema';

describe('schéma — základní kontroly', () => {
  it('má kladné číslo verze', () => {
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });

  it('názvy seznamů jsou jedinečné', () => {
    const names = LISTS.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('interní názvy sloupců jsou v rámci seznamu jedinečné', () => {
    LISTS.forEach((list) => {
      const names = list.fields.map((f) => f.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it('interní názvy sloupců jsou bez diakritiky a mezer', () => {
    LISTS.forEach((list) => {
      list.fields.forEach((field) => {
        expect(field.name).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
      });
    });
  });

  it('nepoužívá interní názvy vyhrazené SharePointem', () => {
    // Title, ID, Created, Modified, Author, Editor zakládá SharePoint sám.
    const rezervovane = ['Title', 'ID', 'Created', 'Modified', 'Author', 'Editor', 'Attachments'];
    LISTS.forEach((list) => {
      list.fields.forEach((field) => {
        expect(rezervovane).not.toContain(field.name);
      });
    });
  });

  it('každý sloupec typu Choice má vyplněné volby', () => {
    LISTS.forEach((list) => {
      list.fields
        .filter((f) => f.type === 'Choice' || f.type === 'MultiChoice')
        .forEach((f) => {
          expect(f.choices && f.choices.length).toBeGreaterThan(0);
        });
    });
  });

  it('výchozí hodnota sloupce Choice je jednou z jeho voleb', () => {
    LISTS.forEach((list) => {
      list.fields
        .filter((f) => f.type === 'Choice' && f.defaultValue)
        .forEach((f) => {
          expect(f.choices).toContain(f.defaultValue as string);
        });
    });
  });

  it('každý Lookup ukazuje na existující seznam', () => {
    const names = new Set(LISTS.map((l) => l.name));
    LISTS.forEach((list) => {
      list.fields
        .filter((f) => f.type === 'Lookup')
        .forEach((f) => {
          expect(f.lookupList).toBeDefined();
          expect(names.has(f.lookupList as string)).toBe(true);
        });
    });
  });

  it('na všech seznamech je zapnutá historie verzí — kvůli auditu', () => {
    LISTS.forEach((list) => {
      expect(list.versioning).toBe(true);
    });
  });

  it('seznamy pro důvěrná data jsou jen na webu PRM-Finance', () => {
    LISTS.filter((l) => l.name.indexOf('FIN_') === 0).forEach((l) => {
      expect(l.site).toBe('PRM-Finance');
    });
    LISTS.filter((l) => l.name.indexOf('PRM_') === 0).forEach((l) => {
      expect(l.site).toBe('PRM');
    });
  });
});

describe('indexy', () => {
  it('zakázky mají index na sloupcích, podle kterých dashboard filtruje', () => {
    const projects = LISTS.filter((l) => l.name === 'PRM_Projects')[0];
    const indexed = indexedFields(projects).map((f) => f.name);
    ['ProjectNumber', 'ProjectStatus', 'ProjectManager', 'ProjectYear', 'ProjectType'].forEach(
      (name) => expect(indexed).toContain(name)
    );
  });

  it('každý seznam vázaný na zakázku má index na sloupci Project', () => {
    LISTS.filter((l) => l.fields.some((f) => f.name === 'Project')).forEach((list) => {
      const project = list.fields.filter((f) => f.name === 'Project')[0];
      expect(project.indexed).toBe(true);
    });
  });
});

describe('listsForSite', () => {
  it('rozdělí seznamy mezi weby a nic nevynechá', () => {
    const prm = listsForSite('PRM');
    const fin = listsForSite('PRM-Finance');
    expect(prm.length + fin.length).toBe(LISTS.length);
    expect(prm.length).toBeGreaterThan(0);
    expect(fin.length).toBeGreaterThan(0);
  });
});

describe('creationOrder', () => {
  it('cílový seznam lookupu se zakládá dřív než seznam, který na něj odkazuje', () => {
    const order = creationOrder(listsForSite('PRM'));
    const position = new Map(order.map((l, i) => [l.name, i]));

    order.forEach((list) => {
      list.fields
        .filter((f) => f.type === 'Lookup' && f.lookupList && f.lookupList !== list.name)
        .forEach((f) => {
          const target = position.get(f.lookupList as string);
          // Lookup do seznamu na jiném webu se tady neřeší.
          if (target !== undefined) {
            expect(target).toBeLessThan(position.get(list.name) as number);
          }
        });
    });
  });

  it('nevynechá ani nezduplikuje žádný seznam', () => {
    const vstup = listsForSite('PRM');
    const order = creationOrder(vstup);
    expect(order.length).toBe(vstup.length);
    expect(new Set(order.map((l) => l.name)).size).toBe(vstup.length);
  });

  it('cyklus v odkazech instalaci neshodí', () => {
    const a: ListDef = {
      name: 'A', title: 'A', description: '', kind: 'list', site: 'PRM', versioning: true,
      fields: [{ name: 'RefB', title: 'B', type: 'Lookup', lookupList: 'B' }]
    };
    const b: ListDef = {
      name: 'B', title: 'B', description: '', kind: 'list', site: 'PRM', versioning: true,
      fields: [{ name: 'RefA', title: 'A', type: 'Lookup', lookupList: 'A' }]
    };
    const order = creationOrder([a, b]);
    expect(order.length).toBe(2);
  });
});
