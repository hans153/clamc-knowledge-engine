import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "Login",
      component: () => import("../components/auth/LoginPage.vue"),
    },
    {
      path: "/register",
      name: "Register",
      component: () => import("../components/auth/RegisterPage.vue"),
    },
    {
      path: "/",
      component: () => import("../App.vue"),
      redirect: "/knowledge",
      children: [
        {
          path: "knowledge",
          name: "Knowledge",
          component: () => import("../components/layout/MainContent.vue"),
        },
      ],
    },
  ],
});
