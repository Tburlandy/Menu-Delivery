import { PublicMenuView } from '../../../modules/public/public-menu-view';
export default async function PublicMenu({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <PublicMenuView slug={slug} />; }
