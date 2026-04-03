import { AdMob, BannerAdOptions, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export interface AdConfig {
    banner_ad_unit_id: string;
    interstitial_ad_unit_id?: string;
    min_interval: number;
    max_interval: number;
    is_active: boolean;
}

class AdManagerService {
    private isInitialized = false;
    private config: AdConfig | null = null;
    private isBannerShowing = false;
    private lastInterstitialTime = 0;
    private bannerPromise: Promise<void> | null = null;

    private async executeBannerAction(action: () => Promise<void>) {
        // Wait for any pending banner action to complete
        while (this.bannerPromise) {
            await this.bannerPromise;
        }
        
        // Create new promise for this action
        let resolveAction: () => void;
        this.bannerPromise = new Promise(resolve => {
            resolveAction = resolve;
        });

        try {
            await action();
        } finally {
            this.bannerPromise = null;
            resolveAction!();
        }
    }

    private async showBannerWithOptions(options: BannerAdOptions, webMessage: string) {
        if (!this.isInitialized || !this.config?.is_active) return;

        await this.executeBannerAction(async () => {
            if (this.isBannerShowing) {
                if (Capacitor.getPlatform() !== 'web') {
                    try { await AdMob.hideBanner(); } catch (e) { console.error(e); }
                }
                this.isBannerShowing = false;
            }

            if (Capacitor.getPlatform() === 'web') {
                console.log(`[AdManager] Web Preview: ${webMessage}`);
                this.isBannerShowing = true;
                return;
            }

            try {
                await AdMob.showBanner(options);
                this.isBannerShowing = true;
            } catch (error) {
                console.error('Failed to show banner ad', error);
            }
        });
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            if (Capacitor.getPlatform() !== 'web') {
                await AdMob.initialize();
            }
            this.isInitialized = true;
            await this.fetchConfig();
        } catch (error) {
            console.error('AdMob initialization failed', error);
        }
    }

    async fetchConfig() {
        try {
            // Use android config for web preview testing
            const platform = Capacitor.getPlatform() === 'web' ? 'android' : Capacitor.getPlatform();

            const { data, error } = await supabase
                .from('ad_config')
                .select('*')
                .eq('platform', platform)
                .single();

            if (error) throw error;
            if (data) {
                this.config = data;
            }
        } catch (error) {
            console.error('Failed to fetch ad config', error);
            // Fallback config if network fails
            this.config = {
                banner_ad_unit_id: Capacitor.getPlatform() === 'ios' 
                    ? 'ca-app-pub-3940256099942544/2934735716' // iOS Test Banner
                    : 'ca-app-pub-3940256099942544/6300978111', // Android Test Banner
                interstitial_ad_unit_id: Capacitor.getPlatform() === 'ios'
                    ? 'ca-app-pub-3940256099942544/4411468910' // iOS Test Interstitial
                    : 'ca-app-pub-3940256099942544/1033173712', // Android Test Interstitial
                min_interval: 3,
                max_interval: 5,
                is_active: true
            };
        }
    }

    getConfig(): AdConfig | null {
        return this.config;
    }

    async showFlashcardBanner() {
        const options: BannerAdOptions = {
            adId: this.config?.banner_ad_unit_id || (Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111'),
            adSize: BannerAdSize.MEDIUM_RECTANGLE,
            position: BannerAdPosition.TOP_CENTER,
            margin: 240, // Pushed down further to center perfectly in the flashcard container
            isTesting: false // Live ads enabled
        };
        await this.showBannerWithOptions(options, 'Showing Flashcard Banner Ad Placeholder');
    }

    async showPodcastBanner() {
        const options: BannerAdOptions = {
            adId: this.config?.banner_ad_unit_id || (Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111'),
            adSize: BannerAdSize.MEDIUM_RECTANGLE,
            position: BannerAdPosition.TOP_CENTER,
            margin: 80, // Approximate offset to overlay the album art
            isTesting: false // Live ads enabled
        };
        await this.showBannerWithOptions(options, 'Showing Podcast Banner Ad Placeholder');
    }

    async showReviewBanner() {
        const options: BannerAdOptions = {
            adId: this.config?.banner_ad_unit_id || (Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111'),
            adSize: BannerAdSize.BANNER, // 320x50
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 60, // Clear the tab bar
            isTesting: false // Live ads enabled
        };
        await this.showBannerWithOptions(options, 'Showing Review Banner Ad Placeholder (320x50)');
    }

    async showQuizReviewBanner() {
        const options: BannerAdOptions = {
            adId: this.config?.banner_ad_unit_id || (Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111'),
            adSize: BannerAdSize.MEDIUM_RECTANGLE,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 80, // Clear the bottom buttons
            isTesting: false
        };
        await this.showBannerWithOptions(options, 'Showing Quiz Review Banner Ad Placeholder');
    }

    async showSourceViewerBanner() {
        const options: BannerAdOptions = {
            adId: this.config?.banner_ad_unit_id || (Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111'),
            adSize: BannerAdSize.MEDIUM_RECTANGLE,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 20,
            isTesting: false
        };
        await this.showBannerWithOptions(options, 'Showing Source Viewer Banner Ad Placeholder');
    }

    async showTopicSelectorBanner() {
        const options: BannerAdOptions = {
            adId: this.config?.banner_ad_unit_id || (Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111'),
            adSize: BannerAdSize.BANNER,
            position: BannerAdPosition.TOP_CENTER,
            margin: 60, // Clear the header
            isTesting: false
        };
        await this.showBannerWithOptions(options, 'Showing Topic Selector Banner Ad Placeholder');
    }

    async showChatBanner() {
        const options: BannerAdOptions = {
            adId: this.config?.banner_ad_unit_id || (Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111'),
            adSize: BannerAdSize.MEDIUM_RECTANGLE, // User requested rectangular banner
            position: BannerAdPosition.TOP_CENTER,
            margin: 60, // Clear the header
            isTesting: false // Live ads enabled
        };
        await this.showBannerWithOptions(options, 'Showing Chat Banner Ad Placeholder');
    }

    async showInterstitial() {
        if (!this.isInitialized || !this.config?.is_active) return;

        if (Capacitor.getPlatform() === 'web') {
            console.log('[AdManager] Web Preview: Showing Interstitial Ad Placeholder');
            this.lastInterstitialTime = Date.now();
            return;
        }

        try {
            const adId = this.config?.interstitial_ad_unit_id || (Capacitor.getPlatform() === 'ios' 
                ? 'ca-app-pub-3940256099942544/4411468910' // iOS Test Interstitial
                : 'ca-app-pub-3940256099942544/1033173712'); // Android Test Interstitial

            await AdMob.prepareInterstitial({
                adId,
                isTesting: false // Live ads enabled
            });
            await AdMob.showInterstitial();
            this.lastInterstitialTime = Date.now();
        } catch (error) {
            console.error('Failed to show interstitial ad', error);
        }
    }

    async hideBanner() {
        await this.executeBannerAction(async () => {
            if (!this.isBannerShowing) return;
            
            if (Capacitor.getPlatform() === 'web') {
                console.log('[AdManager] Web Preview: Hiding Banner Ad Placeholder');
                this.isBannerShowing = false;
                return;
            }

            try {
                await AdMob.hideBanner();
                this.isBannerShowing = false;
            } catch (error) {
                console.error('Failed to hide banner ad', error);
            }
        });
    }

    async fetchChatAd(): Promise<{ title: string; description: string; imageUrl: string; link: string } | null> {
        try {
            // Fetch a random active ad from the server (Supabase)
            const { data, error } = await supabase
                .from('chat_ads')
                .select('*')
                .eq('is_active', true)
                .limit(10); // Fetch a few to pick randomly

            if (error) {
                console.error('Failed to fetch chat ad from server:', error);
                return this.getFallbackChatAd();
            }

            if (data && data.length > 0) {
                const randomAd = data[Math.floor(Math.random() * data.length)];
                return {
                    title: randomAd.title,
                    description: randomAd.description,
                    imageUrl: randomAd.image_url,
                    link: randomAd.link
                };
            }
            
            return this.getFallbackChatAd();
        } catch (error) {
            console.error('Error fetching chat ad:', error);
            return this.getFallbackChatAd();
        }
    }

    private getFallbackChatAd() {
        // Fallback ad if server fetch fails or no ads are configured
        return {
            title: 'Master Your Exams with Premium',
            description: 'Get exclusive access to 10,000+ mock tests, live classes, and personalized mentorship. Upgrade now!',
            imageUrl: 'https://picsum.photos/seed/study/600/300',
            link: 'https://example.com/premium'
        };
    }
}

export const AdManager = new AdManagerService();