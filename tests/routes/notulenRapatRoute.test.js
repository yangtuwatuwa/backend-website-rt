import { describe, expect, it, jest } from "@jest/globals";
import router from "../../routes/notulenRapat.js";

function findRoute(method, path) {
    return router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route;
}

function responseMock() {
    const res = {
        status: jest.fn(),
        json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
}

describe("Route Notulen Rapat", () => {
    it.each(["warga", "rt", "admin", "superadmin", "bendahara"])(
        "menolak role %s pada POST",
        (role) => {
            const route = findRoute("post", "/notulen-rapat");
            const guard = route.stack[0].handle;
            const res = responseMock();
            const next = jest.fn();

            guard({ user: { role } }, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(403);
        },
    );

    it("mengizinkan sekertaris pada POST/PATCH/DELETE", () => {
        for (const method of ["post", "patch", "delete"]) {
            const path = method === "post" ? "/notulen-rapat" : "/notulen-rapat/:id";
            const route = findRoute(method, path);
            const guard = route.stack[0].handle;
            const next = jest.fn();
            guard({ user: { role: "sekertaris" } }, responseMock(), next);
            expect(next).toHaveBeenCalledTimes(1);
        }
    });

    it("menerapkan JWT global dan tidak menambahkan role gate pada kedua GET", () => {
        const globalMiddleware = router.stack.find((layer) => !layer.route);
        expect(globalMiddleware).toBeTruthy();
        expect(findRoute("get", "/notulen-rapat").stack).toHaveLength(1);
        expect(findRoute("get", "/notulen-rapat/:id").stack).toHaveLength(1);
    });
});
