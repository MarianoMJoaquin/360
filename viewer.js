const CONFIG = {
    versions: ['xli', 'xei', 'seg'],
    colors: ['red', 'blue', 'white'],
    totalFrames: 30,
    frameWidth: 100 / 30,
    imageBasePath: 'corolla/',
    subversions: {
        xli: ['mt', 'at', 'gr'],
        xei: ['mt', 'at'],
        seg: ['gr']
    },
    descriptions: {
        mt: ["Transmisión manual", "5 velocidades", "Tracción delantera"],
        at: ["Transmisión automática", "6 velocidades", "Tracción delantera"],
        gr: ["Transmisión GR", "6 velocidades deportivas", "Tracción trasera", "Edición deportiva"]
    }
};

class ImageLoader {
    #cache = new Map();
    #loadingQueue = new Set();
    #preloadThreshold = 2000;

    async loadImage(version, color) {
        const key = `${version}-${color}`;
        if (this.#cache.has(key)) return this.#cache.get(key);
        
        const img = await this.#loadSingleImage(version, color);
        setTimeout(() => this.#preloadRelatedImages(version, color), this.#preloadThreshold);
        return img;
    }

    async #loadSingleImage(version, color) {
        const key = `${version}-${color}`;
        
        if (this.#loadingQueue.has(key)) {
            return new Promise(resolve => {
                const checkCache = setInterval(() => {
                    if (this.#cache.has(key)) {
                        clearInterval(checkCache);
                        resolve(this.#cache.get(key));
                    }
                }, 100);
            });
        }

        this.#loadingQueue.add(key);
        try {
            const img = new Image();
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = `${CONFIG.imageBasePath}corolla-${version}-${color}.png`;
            });
            this.#cache.set(key, img);
            return img;
        } finally {
            this.#loadingQueue.delete(key);
        }
    }

    #preloadRelatedImages(currentVersion, currentColor) {
        CONFIG.colors
            .filter(color => color !== currentColor)
            .forEach(color => this.#loadSingleImage(currentVersion, color));
            
        const versionIndex = CONFIG.versions.indexOf(currentVersion);
        [-1, 1].forEach(offset => {
            const neighborIndex = versionIndex + offset;
            if (neighborIndex >= 0 && neighborIndex < CONFIG.versions.length) {
                this.#loadSingleImage(CONFIG.versions[neighborIndex], currentColor);
            }
        });
    }
}

const utils = {
    animate: {
        requestFrame: (callback) => {
            let animationId = null;
            const animate = () => {
                animationId = requestAnimationFrame(animate);
                callback();
            };
            animate();
            return () => cancelAnimationFrame(animationId);
        },
        lerp: (start, end, t) => start * (1 - t) + end * t
    },
    events: {
        getEventPosition: (event) => event.touches ? event.touches[0].pageX : event.pageX,
        throttle: (fn, limit) => {
            let inThrottle;
            return (...args) => {
                if (!inThrottle) {
                    fn(...args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            }
        }
    }
};

class CarViewer {
    #state;
    #elements;
    #animationStop;
    #imageLoader;

    constructor() {
        this.#state = {
            currentFrame: 0,
            isDragging: false,
            startX: 0,
            currentColor: 'red',
            currentVersion: 'xli',
            currentSubversion: 'mt',
            isLoading: false,
            hasError: false
        };
        this.#imageLoader = new ImageLoader();
        this.#elements = this.#getElements();
        this.#animationStop = null;
        this.init();
    }

    async init() {
        try {
            this.#showLoading(true);
            await this.#imageLoader.loadImage(this.#state.currentVersion, this.#state.currentColor);
            this.#setupEventListeners();
            this.#setupA11y();
            this.updateUI();
        } catch (error) {
            this.#showError(error);
        } finally {
            this.#showLoading(false);
        }
    }

    #getElements() {
        return {
            viewer: document.getElementById('viewer'),
            loading: document.getElementById('loading'),
            error: document.getElementById('error'),
            colorButtons: document.querySelectorAll('.color-button'),
            versionTabs: document.querySelectorAll('.version-tab'),
            subversionTabs: document.querySelectorAll('.subversion-tab'),
            descriptionList: document.getElementById('descriptionList')
        };
    }

    #setupEventListeners() {
        this.#setupViewerEvents();
        this.#setupControlEvents();
        this.#setupKeyboardEvents();
    }

    #setupViewerEvents() {
        const viewer = this.#elements.viewer;
        let lastX = 0;
        let velocity = 0;
        const friction = 0.95;
        const sensitivity = 0.05;
    
        const handleDrag = (event) => {
            if (this.#state.isDragging) {
                const currentX = utils.events.getEventPosition(event);
                const deltaX = currentX - lastX;
                velocity = deltaX * sensitivity;
                this.#updateFrameByVelocity(velocity);
                lastX = currentX;
            }
        };
    
        viewer.addEventListener('mousedown', (e) => {
            lastX = utils.events.getEventPosition(e);
            this.#startDrag(lastX);
        });
        
        viewer.addEventListener('mousemove', handleDrag);
        viewer.addEventListener('mouseup', () => this.#stopDrag());
        viewer.addEventListener('mouseleave', () => this.#stopDrag());
    
        // Touch events
        viewer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            lastX = utils.events.getEventPosition(e);
            this.#startDrag(lastX);
        });
        
        viewer.addEventListener('touchmove', (e) => {
            e.preventDefault();
            handleDrag(e);
        });
        
        viewer.addEventListener('touchend', () => this.#stopDrag());
    }

    #updateFrameByVelocity(velocity) {
        // Invert velocity to match natural drag direction
        const frameChange = Math.round(-velocity); // Added negative sign
        this.#state.currentFrame = (this.#state.currentFrame - frameChange + CONFIG.totalFrames) % CONFIG.totalFrames;
        this.#updateSprite();
    }

    #setupControlEvents() {
        this.#elements.colorButtons.forEach(button => {
            button.addEventListener('click', () => {
                const color = button.dataset.color;
                this.changeColor(color);
            });
        });

        this.#elements.versionTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const version = tab.dataset.version;
                this.changeVersion(version);
            });
        });

        this.#elements.subversionTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const subversion = tab.dataset.subversion;
                this.changeSubversion(subversion);
            });
        });
    }

    #setupKeyboardEvents() {
        this.#elements.viewer.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowLeft':
                    this.#rotateLeft();
                    break;
                case 'ArrowRight':
                    this.#rotateRight();
                    break;
            }
        });
    }

    #updateSprite() {
        const { currentVersion, currentColor, currentFrame } = this.#state;
        const viewer = this.#elements.viewer;
        viewer.style.backgroundImage = `url('${CONFIG.imageBasePath}corolla-${currentVersion}-${currentColor}.png')`;
        viewer.style.backgroundPosition = `${currentFrame * CONFIG.frameWidth}% 0`;
    }

    #startDrag(startX) {
        this.#state.isDragging = true;
        this.#state.startX = startX;
        this.#elements.viewer.classList.add('grabbing');
        this.#startAnimation();
    }

    #stopDrag() {
        this.#state.isDragging = false;
        this.#elements.viewer.classList.remove('grabbing');
        this.#stopAnimation();
    }

    #startAnimation() {
        this.#animationStop = utils.animate.requestFrame(() => {
            if (this.#state.isDragging) {
                this.#updateSprite();
            }
        });
    }

    #stopAnimation() {
        if (this.#animationStop) {
            this.#animationStop();
            this.#animationStop = null;
        }
    }

    async changeColor(color) {
        if (!CONFIG.colors.includes(color)) return;
        
        this.#showLoading(true);
        try {
            await this.#imageLoader.loadImage(this.#state.currentVersion, color);
            this.#state.currentColor = color;
            this.updateUI();
        } catch (error) {
            this.#showError(error);
        } finally {
            this.#showLoading(false);
        }
    }

    async changeVersion(version) {
        if (!CONFIG.versions.includes(version)) return;
        
        this.#showLoading(true);
        try {
            await this.#imageLoader.loadImage(version, this.#state.currentColor);
            this.#state.currentVersion = version;
            this.updateUI();
            this.#updateSubversionTabs(version);
        } catch (error) {
            this.#showError(error);
        } finally {
            this.#showLoading(false);
        }
    }

    changeSubversion(subversion) {
        this.#state.currentSubversion = subversion;
        this.#updateDescription(subversion);
    }

    #updateSubversionTabs(version) {
        const subversions = CONFIG.subversions[version];
        this.#elements.subversionTabs.forEach(tab => {
            const subversion = tab.dataset.subversion;
            tab.classList.toggle('hidden', !subversions.includes(subversion));
        });
        
        if (subversions.length > 0) {
            this.changeSubversion(subversions[0]);
        }
    }

    #updateDescription(subversion) {
        const descriptions = CONFIG.descriptions[subversion];
        const list = this.#elements.descriptionList;
        list.innerHTML = descriptions.map(desc => `<li>${desc}</li>`).join('');
    }

    updateUI() {
        this.#updateSprite();
        this.#updateTabStates();
    }

    #updateTabStates() {
        const { currentVersion } = this.#state;
        document.querySelectorAll('.version-tab').forEach(tab => {
            const isActive = tab.dataset.version === currentVersion;
            tab.classList.toggle('active-tab', isActive);
            tab.classList.toggle('bg-gray-700', isActive);
            tab.classList.toggle('text-white', isActive);
            tab.classList.toggle('bg-gray-300', !isActive);
            tab.classList.toggle('text-gray-700', !isActive);
        });
    }

    #setupA11y() {
        const viewer = this.#elements.viewer;
        viewer.setAttribute('role', 'img');
        viewer.setAttribute('aria-label', 'Interactive 360° car viewer');
        viewer.setAttribute('tabindex', '0');
        viewer.setAttribute('aria-live', 'polite');
    }

    #showLoading(show) {
        this.#elements.loading.classList.toggle('hidden', !show);
    }

    #showError(error) {
        this.#elements.error.classList.remove('hidden');
        this.#elements.error.textContent = `Error: ${error.message}`;
    }

    #rotateLeft() {
        this.#state.currentFrame = (this.#state.currentFrame - 1 + CONFIG.totalFrames) % CONFIG.totalFrames;
        this.#updateSprite();
    }

    #rotateRight() {
        this.#state.currentFrame = (this.#state.currentFrame + 1) % CONFIG.totalFrames;
        this.#updateSprite();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new CarViewer();
});