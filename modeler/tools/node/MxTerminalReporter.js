const TerminalReporter = require("metro/src/lib/TerminalReporter");

class MxTerminalReporter extends TerminalReporter {

    constructor(args) {
        super(args);
    }

    logMxPackagerEvent(event) {
        /**
         * Extend this list of events
         */
         const eventsToSend = [
            "initialize_started",
            "initialize_failed",
            "bundle_build_started",
            "bundle_build_done",
            "bundling_error",
            "global_cache_error",
            "hmr_client_error",
            "transformer_load_failed"
        ];


        if (eventsToSend.includes(event.type)) {
        
            const PACKAGER_MX_MESSAGE_TAG = "MxTerminalReporter:";
            const message = JSON.stringify({
                event: event.type,
                ...(event.error ? { name: event.error.name, message: event.error.message } : {})
            })

            this.terminal.log(PACKAGER_MX_MESSAGE_TAG, message);
        }
    }

    update(event) {
        super.update(event);

        this.logMxPackagerEvent(event);
    }
}


module.exports = MxTerminalReporter;