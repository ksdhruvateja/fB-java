import { renderToString } from 'react-dom/server';
import { Nav, Footer } from './MarketingLayout';
import CustomerPage from './CustomerPage';
import ContractorPage from './ContractorPage';
import AboutPage from './AboutPage';
import GoProPublicPage from './GoProPublicPage';
import SolutionPage from './ServiceSolutions';
import type { AppPage } from './navigation';
const noop = () => {};
export function renderPublicPage(page: AppPage) {
  return renderToString(<div data-scroll-root className="size-full overflow-y-auto overflow-x-hidden bg-background text-foreground [font-family:'DM_Sans',sans-serif]"><Nav page={page} onNavigate={noop} marketingContext={page === 'contractors' ? 'contractors' : 'home'} isDark={false} onToggleDark={noop} scrolled={false} /><main>{page === 'home' ? <CustomerPage onGetStarted={noop} /> : page === 'contractors' ? <ContractorPage onApply={noop} /> : page === 'about' ? <AboutPage onGoHomeowner={noop} onGoContractor={noop} /> : page === 'go-pro' ? <GoProPublicPage onBack={noop} /> : <SolutionPage page={page} />}</main><Footer onNavigate={noop} /></div>).replace(/opacity:0(?=;|"|$)/g, 'opacity:1');
}
