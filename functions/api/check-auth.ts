export const onRequestPost = async (context: any) => {
    try {
        const { code } = await context.request.json();
        const envCode = context.env.ACCESS_CODE;

        if (!envCode) {
            return new Response(JSON.stringify({
                success: false,
                message: "Server configuration error: ACCESS_CODE not set."
            }), {
                status: 500,
                headers: { "Content-Type": "application/json" }
            });
        }

        if (code === envCode) {
            // In a real app, you'd return a signed JWT. 
            // For this simple gate, a success flag is enough as it unlocks client-side state.
            return new Response(JSON.stringify({
                success: true,
                token: "valid_session_" + Math.random().toString(36).substring(7)
            }), {
                headers: { "Content-Type": "application/json" }
            });
        } else {
            return new Response(JSON.stringify({
                success: false,
                message: "Invalid access code."
            }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }
    } catch (err) {
        return new Response(JSON.stringify({
            success: false,
            message: "Invalid request format."
        }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }
};
