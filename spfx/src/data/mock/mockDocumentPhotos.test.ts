import { createMockRepositories } from './mockRepositories';
import { MOCK_PROJECTS } from './mockData';
import { loadBatches, batchFolderOf } from '../../features/photos/photoBatches';

const project = MOCK_PROJECTS.filter((p) => p.folderUrl)[0];
const BASE = '07-Dokumentace a podklady/FOTO';

describe('fotodokumentace v ukázkovém úložišti', () => {
  it('dávky jsou podsložky FOTO od nejnovější, poznámka se ukládá k souboru', async () => {
    const docs = createMockRepositories().documents;
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await docs.saveProjectFile(project, `${BASE}/2026-03-01 Mělký výkop`, 'Foto_1.jpg', blob);
    await docs.saveProjectFile(project, `${BASE}/2026-03-01 Mělký výkop`, 'Foto_2.jpg', blob);
    await docs.saveProjectFile(project, `${BASE}/2026-05-02 Izolace`, 'Foto_3.jpg', blob);
    // starší uspořádání: složka s rokem a dávkou uvnitř
    await docs.saveProjectFile(project, `${BASE}/2026/2026-10-01_KD`, 'Foto_4.jpg', blob);
    await docs.saveProjectFile(project, `${BASE}/2026-03-01 Mělký výkop`, 'Poznamky.pdf', blob);

    const batches = await loadBatches(docs, project, BASE);
    expect(batches.map((b) => b.name)).toEqual(['2026-10-01_KD', '2026-05-02 Izolace', '2026-03-01 Mělký výkop']);
    expect(batches[0].path).toBe('2026/2026-10-01_KD');
    expect(batchFolderOf(BASE, batches[0])).toBe(`${BASE}/2026/2026-10-01_KD`);
    expect(batches[2].title).toBe('Mělký výkop');
    expect(batches[2].itemCount).toBe(3);

    const folder = batchFolderOf(BASE, batches[2]);
    await docs.setFileNote(project, folder, 'Foto_1.jpg', '  mělký výkop  ');
    const photos = await docs.listPhotos(project, folder);
    // v galerii jsou jen obrázky, ne PDF
    expect(photos.map((p) => p.name)).toEqual(['Foto_1.jpg', 'Foto_2.jpg']);
    expect(photos[0].note).toBe('mělký výkop');
    expect(photos[1].note).toBeUndefined();

    await docs.setFileNote(project, folder, 'Foto_1.jpg', '');
    expect((await docs.listPhotos(project, folder))[0].note).toBeUndefined();
  });

  it('složka, která neexistuje, nemá žádné dávky', async () => {
    const docs = createMockRepositories().documents;
    expect(await loadBatches(docs, project, BASE)).toEqual([]);
  });

  it('poznámku k neexistujícímu souboru nelze uložit', async () => {
    const docs = createMockRepositories().documents;
    await expect(docs.setFileNote(project, BASE, 'neni.jpg', 'x')).rejects.toThrow();
  });
});
