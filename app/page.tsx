import CreateElectionForm from '@/components/CreateElectionForm';
import ElectionList from '@/components/ElectionList';

export default function HomePage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Anonymous Elections</h1>
        <p className="text-gray-400 text-sm">
          Votes posted as Celestia blobs · Identity proven by ZKPassport · No personal data disclosed
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section>
          <h2 className="text-xl font-semibold text-gray-200 mb-4">Create Election</h2>
          <CreateElectionForm />
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-200 mb-4">Recent Elections</h2>
          <ElectionList />
        </section>
      </div>
    </div>
  );
}
