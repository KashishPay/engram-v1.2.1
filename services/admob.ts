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
        if (!this.isInitialized || !this.config?.is_active) return;

        if (this.isBannerShowing) {
            await this.hideBanner();
        }

        if (Capacitor.getPlatform() === 'web') {
            console.log('[AdManager] Web Preview: Showing Flashcard Banner Ad Placeholder');
            this.isBannerShowing = true;
            return;
        }

        const options: BannerAdOptions = {
            adId: Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111',
            adSize: BannerAdSize.MEDIUM_RECTANGLE,
            position: BannerAdPosition.TOP_CENTER,
            margin: 240, // Pushed down further to center perfectly in the flashcard container
            isTesting: true // Enforce AdMob policies by using test ads during development
        };

        try {
            await AdMob.showBanner(options);
            this.isBannerShowing = true;
        } catch (error) {
            console.error('Failed to show banner ad', error);
        }
    }

    async showPodcastBanner() {
        if (!this.isInitialized || !this.config?.is_active) return;

        if (this.isBannerShowing) {
            await this.hideBanner();
        }

        if (Capacitor.getPlatform() === 'web') {
            console.log('[AdManager] Web Preview: Showing Podcast Banner Ad Placeholder');
            this.isBannerShowing = true;
            return;
        }

        const options: BannerAdOptions = {
            adId: Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111',
            adSize: BannerAdSize.MEDIUM_RECTANGLE,
            position: BannerAdPosition.TOP_CENTER,
            margin: 80, // Approximate offset to overlay the album art
            isTesting: true // Enforce AdMob policies by using test ads during development
        };

        try {
            await AdMob.showBanner(options);
            this.isBannerShowing = true;
        } catch (error) {
            console.error('Failed to show podcast banner ad', error);
        }
    }

    async showReviewBanner() {
        if (!this.isInitialized || !this.config?.is_active) return;

        if (this.isBannerShowing) {
            await this.hideBanner();
        }

        if (Capacitor.getPlatform() === 'web') {
            console.log('[AdManager] Web Preview: Showing Review Banner Ad Placeholder (320x50)');
            this.isBannerShowing = true;
            return;
        }

        const options: BannerAdOptions = {
            adId: Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111',
            adSize: BannerAdSize.BANNER, // 320x50
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 60, // Clear the tab bar
            isTesting: true // Enforce AdMob policies by using test ads during development
        };

        try {
            await AdMob.showBanner(options);
            this.isBannerShowing = true;
        } catch (error) {
            console.error('Failed to show review banner ad', error);
        }
    }

    async showChatBanner() {
        if (!this.isInitialized || !this.config?.is_active) return;

        if (this.isBannerShowing) {
            await this.hideBanner();
        }

        if (Capacitor.getPlatform() === 'web') {
            console.log('[AdManager] Web Preview: Showing Chat Banner Ad Placeholder');
            this.isBannerShowing = true;
            return;
        }

        const options: BannerAdOptions = {
            adId: Capacitor.getPlatform() === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111',
            adSize: BannerAdSize.MEDIUM_RECTANGLE, // User requested rectangular banner
            position: BannerAdPosition.TOP_CENTER,
            margin: 60, // Clear the header
            isTesting: true // Enforce AdMob policies by using test ads during development
        };

        try {
            await AdMob.showBanner(options);
            this.isBannerShowing = true;
        } catch (error) {
            console.error('Failed to show chat banner ad', error);
        }
    }

    async showInterstitial() {
        if (!this.isInitialized || !this.config?.is_active) return;

        // Rate limiter: Don't show interstitials more than once every 3 minutes (180000ms)
        // This prevents aggressive ad behavior that violates AdMob policies
        const now = Date.now();
        if (now - this.lastInterstitialTime < 180000) {
            console.log('[AdManager] Interstitial skipped due to rate limiting (AdMob policy compliance)');
            return;
        }

        if (Capacitor.getPlatform() === 'web') {
            console.log('[AdManager] Web Preview: Showing Interstitial Ad Placeholder');
            this.lastInterstitialTime = now;
            return;
        }

        try {
            const adId = Capacitor.getPlatform() === 'ios' 
                ? 'ca-app-pub-3940256099942544/4411468910' // iOS Test Interstitial
                : 'ca-app-pub-3940256099942544/1033173712'; // Android Test Interstitial

            await AdMob.prepareInterstitial({
                adId,
                isTesting: true // Enforce AdMob policies by using test ads during development
            });
            await AdMob.showInterstitial();
            this.lastInterstitialTime = Date.now();
        } catch (error) {
            console.error('Failed to show interstitial ad', error);
        }
    }

    async hideBanner() {
        if (!this.isBannerShowing) return;
        
        if (Capacitor.getPlatform() === 'web') {
            console.log('[AdManager] Web Preview: Hiding Flashcard Banner Ad Placeholder');
            this.isBannerShowing = false;
            return;
        }

        try {
            await AdMob.hideBanner();
            this.isBannerShowing = false;
        } catch (error) {
            console.error('Failed to hide banner ad', error);
        }
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