import HeroBanner from './HeroBanner.jsx';
import NewsSection from './NewsSection.jsx';
import RecentServersSection from './RecentServersSection.jsx';
import './HomePage.css';

export default function HomePage({
  store,
  account,
  onManageInstances = () => {},
  autoLaunch = false,
  onAutoLaunchDone = () => {}
}) {
  return (
    <>
      <HeroBanner
        store={store}
        account={account}
        onManageInstances={onManageInstances}
        autoLaunch={autoLaunch}
        onAutoLaunchDone={onAutoLaunchDone}
      />
      <div className="home-content">
        <NewsSection />
        <RecentServersSection />
      </div>
    </>
  );
}
