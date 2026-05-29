import { AdMob, RewardAdPluginEvents, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { supabase } from './supabase';

export interface AdConfig {
    banner_ad_unit_id: string;
    interstitial_ad_unit_id?: string;
    reward_ad_unit_id?: string;
    is_active: boolean;
}

class AdManagerService {
    private isInitialized = false;
    private nextAdType: 'interstitial' | 'reward' = 'interstitial';
    private config: AdConfig = {
        banner_ad_unit_id: Capacitor.getPlatform() === 'ios' 
            ? 'ca-app-pub-3940256099942544/2934735716' // iOS Test Banner
            : 'ca-app-pub-1930133918087114/4505148021', // Android Live Banner
        interstitial_ad_unit_id: Capacitor.getPlatform() === 'ios'
            ? 'ca-app-pub-3940256099942544/4411468910' // iOS Test Interstitial
            : 'ca-app-pub-1930133918087114/1346538190', // Android Live Interstitial
        reward_ad_unit_id: Capacitor.getPlatform() === 'ios'
            ? 'ca-app-pub-3940256099942544/1712485313' // iOS Test Reward
            : 'ca-app-pub-1930133918087114/9090827465', // Android Live Reward
        is_active: true
    };
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
            // Keep hardcoded live config if network fails
        }
    }

    getConfig(): AdConfig | null {
        return this.config;
    }

    async showInterstitial() {
        if (!this.isInitialized || !this.config?.is_active) return;

        if (Capacitor.getPlatform() === 'web') {
            console.log('[AdManager] Web Preview: Showing Interstitial Ad Placeholder');
            return;
        }

        return new Promise<void>((resolve) => {
            const listeners: PluginListenerHandle[] = [];
            const clearListeners = () => {
                listeners.forEach(l => l.remove());
            };

            const setupInterstitial = async () => {
                try {
                    const adId = this.config?.interstitial_ad_unit_id || (Capacitor.getPlatform() === 'ios' 
                        ? 'ca-app-pub-3940256099942544/4411468910' // iOS Test Interstitial
                        : 'ca-app-pub-1930133918087114/1346538190'); // Android Test Interstitial

                    listeners.push(await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
                        clearListeners();
                        resolve();
                    }));

                    listeners.push(await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (err) => {
                        console.error('Failed to show interstitial', err);
                        clearListeners();
                        resolve();
                    }));

                    listeners.push(await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (err) => {
                        console.error('Failed to load interstitial', err);
                        clearListeners();
                        resolve();
                    }));

                    listeners.push(await AdMob.addListener(InterstitialAdPluginEvents.Loaded, () => {
                        AdMob.showInterstitial().catch((e) => {
                            console.error('Failed to show loaded interstitial', e);
                            clearListeners();
                            resolve();
                        });
                    }));

                    await AdMob.prepareInterstitial({
                        adId,
                        isTesting: false 
                    });
                } catch (error) {
                    console.error('Error in interstitial ad sequence', error);
                    clearListeners();
                    resolve();
                }
            };
            
            setupInterstitial();
        });
    }

    async showAlternatingAd(): Promise<boolean> {
        if (this.nextAdType === 'interstitial') {
            this.nextAdType = 'reward';
            await this.showInterstitial();
            return true;
        } else {
            this.nextAdType = 'interstitial';
            await this.showRewardVideo();
            return true;
        }
    }

    async showRewardVideo(): Promise<boolean> {
        if (!this.isInitialized || !this.config?.is_active) return true; // Pretend we rewarded if ads inactive

        if (Capacitor.getPlatform() === 'web') {
            console.log('[AdManager] Web Preview: Showing Reward Video Ad Placeholder. Rewarding user.');
            return true;
        }

        return new Promise<boolean>((resolve) => {
            let rewarded = false;

            const setupReward = async () => {
                try {
                    const adId = this.config?.reward_ad_unit_id || (Capacitor.getPlatform() === 'ios' 
                        ? 'ca-app-pub-3940256099942544/1712485313' 
                        : 'ca-app-pub-1930133918087114/9090827465'); // Android Live Reward, as backup

                    const listeners: PluginListenerHandle[] = [];
                    
                    const clearListeners = () => {
                       listeners.forEach(l => l.remove());
                    };

                    listeners.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward) => {
                        console.log('Reward received:', reward);
                        rewarded = true;
                    }));

                    listeners.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
                        clearListeners();
                        resolve(rewarded);
                    }));

                    listeners.push(await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err) => {
                        console.error('Reward ad failed to load', err);
                        clearListeners();
                        resolve(true); // Fallback rewarding logic when ad blocks/fails so user isn't stuck
                    }));

                    listeners.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err) => {
                        console.error('Reward ad failed to show', err);
                        clearListeners();
                        resolve(true); // Fallback rewarding logic
                    }));

                    listeners.push(await AdMob.addListener(RewardAdPluginEvents.Loaded, () => {
                        AdMob.showRewardVideoAd().catch((e) => {
                            console.error('Failed to show loaded reward ad', e);
                            clearListeners();
                            resolve(true);
                        });
                    }));

                    await AdMob.prepareRewardVideoAd({ adId, isTesting: false });

                } catch (error) {
                    console.error('Failed to prepare/show reward video ad', error);
                    resolve(true); // Fail silently and let the user continue
                }
            };

            setupReward();
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