import { createTournament } from './actions';

export default function NewTournamentPage() {
  return (
    <main style={{ maxWidth: 400, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h1>New Tournament</h1>
      <form action={createTournament}>
        <input name="name" type="text" placeholder="Tournament name" required />
        <input name="date" type="date" required />
        <label>
          Target score
          <input name="targetScore" type="number" defaultValue={11} required />
        </label>
        <label>
          Win by
          <input name="winBy" type="number" defaultValue={2} required />
        </label>
        <button type="submit">Create</button>
      </form>
    </main>
  );
}
