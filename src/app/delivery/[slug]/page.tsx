import { PublicDeliveryView } from '../../../modules/public/public-delivery-view';
export default async function DeliveryPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; return <PublicDeliveryView slug={slug} />; }
